import { beforeEach, describe, expect, it } from 'vitest';

import type { Note } from '../../../domain/note';
import { aDoc, aNote, required } from '../../../test-support/builders';
import type { NotePatch } from '../../ports/note-repository';
import { NoteRepositoryFake } from '../note-repository-fake';

const CREATED_ISO = '2026-01-01T00:00:00.000Z';
const PLAN_ITEM_ID = 'plan-book-1-2026-10-01';
const OTHER_PLAN_ITEM_ID = 'plan-book-1-2026-10-02';
const THIRD_PLAN_ITEM_ID = 'plan-book-1-2026-10-03';
const AUTHOR_ID = 'user-maria';
const OTHER_AUTHOR_ID = 'user-marcos';
const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_BOOK_ID = 'book-2';

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('NoteRepositoryFake', () => {
  let notes: NoteRepositoryFake;

  beforeEach(() => {
    notes = new NoteRepositoryFake();
  });

  // Regra 36
  describe('save is an upsert by id', () => {
    it('returns the note it stored', async () => {
      const note = aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID });

      const returned = await notes.save(note);

      expect(returned).toEqual(note);
      expect(notes.saved).toEqual([note]);
    });

    it('overwrites the same id in place instead of adding a second row', async () => {
      const first = aNote({
        planItemId: PLAN_ITEM_ID,
        userId: AUTHOR_ID,
        title: 'Cap. 3',
      });
      await notes.save(first);

      await notes.save({ ...first, title: 'Cap. 3 — A promessa' });

      expect(notes.saved).toHaveLength(1);
      expect(required(notes.saved[0]).title).toBe('Cap. 3 — A promessa');
    });

    it('keeps two notes with different ids', async () => {
      await notes.save(aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }));
      await notes.save(
        aNote({ planItemId: OTHER_PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      expect(notes.saved).toHaveLength(2);
    });

    // Mesmo padrão do `compareCalls` do PasswordHasherFake
    // (CONVENCOES-CODIGO §6.4): `saved` inalterado não distingue "não chamou"
    // de "chamou e o índice recusou", e é a diferença que os testes de
    // caminho de erro dos UseCases afirmam.
    it('counts every save call, including the one an index refused', async () => {
      expect(notes.saveCalls).toBe(0);

      await notes.save(
        aNote({ id: 'note-a', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );
      await expect(
        notes.save(
          aNote({ id: 'note-b', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
        ),
      ).rejects.toThrow(/unique\(planItemId, userId\)/);

      expect(notes.saveCalls).toBe(2);
      expect(notes.saved).toHaveLength(1);
    });
  });

  /**
   * Regra 37 — o índice `unique(planItemId, userId)` do Postgres, emulado
   * **linha por linha** e contra o estado da tabela naquele instante.
   *
   * Um fake que não recusasse deixaria a regra "uma nota por pessoa por dia de
   * leitura" passar verde aqui e estourar em produção; um fake MAIS restritivo
   * que o banco também é infidelidade (→ ADR 0007), e é o que a regra 38 mede.
   */
  describe('unique(planItemId, userId)', () => {
    it('refuses a second note of the same author on the same plan item', async () => {
      await notes.save(
        aNote({ id: 'note-a', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      await expect(
        notes.save(
          aNote({ id: 'note-b', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
        ),
      ).rejects.toThrow(/unique\(planItemId, userId\)/);
    });

    it('allows two authors on the same plan item', async () => {
      await notes.save(aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }));
      await notes.save(
        aNote({ planItemId: PLAN_ITEM_ID, userId: OTHER_AUTHOR_ID }),
      );

      expect(notes.saved).toHaveLength(2);
    });

    it('allows the same author on two plan items', async () => {
      await notes.save(aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }));
      await notes.save(
        aNote({ planItemId: OTHER_PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      expect(notes.saved).toHaveLength(2);
    });

    it('lets the same id be rewritten: it does not collide with itself', async () => {
      const note = aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID });
      await notes.save(note);

      await expect(
        notes.save({ ...note, doc: aDoc('reescrevi tudo') }),
      ).resolves.toBeTruthy();

      expect(notes.saved).toHaveLength(1);
    });

    // O índice não olha status: a nota arquivada continua ocupando o par. É por
    // isso que o upsert do dia REATIVA em vez de criar outra (regra 26).
    it('refuses a second note even when the stored one is archived', async () => {
      await notes.save(
        aNote({
          id: 'note-a',
          planItemId: PLAN_ITEM_ID,
          userId: AUTHOR_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        notes.save(
          aNote({ id: 'note-b', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
        ),
      ).rejects.toThrow(/unique\(planItemId, userId\)/);
    });

    it('refuses before writing: the store keeps only the first note', async () => {
      const first = aNote({
        id: 'note-a',
        planItemId: PLAN_ITEM_ID,
        userId: AUTHOR_ID,
      });
      await notes.save(first);

      await expect(
        notes.save(
          aNote({ id: 'note-b', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
        ),
      ).rejects.toThrow();

      expect(notes.saved).toEqual([first]);
    });

    // Contrato do fake, não regra de domínio: quem cair aqui escreveu uma nota
    // que o Postgres recusaria, e isso é bug de código, não entrada do usuário.
    it('signals an index violation with a raw Error, never a domain error', async () => {
      await notes.save(
        aNote({ id: 'note-a', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      const error = await caught(
        notes.save(
          aNote({ id: 'note-b', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
        ),
      );

      expect(error.name).toBe('Error');
    });
  });

  /**
   * Regra 38 — `NULL` **não colide**, que é a metade em que um fake ingênuo
   * erra: no Postgres um índice único não compara `NULL` com `NULL`, então N
   * anotações avulsas do mesmo autor no mesmo livro convivem. Tratar
   * `planItemId: null` como valor reprovaria a segunda avulsa — exatamente o
   * comportamento que o BACKLOG declara ilimitado.
   */
  describe('a null planItemId never collides', () => {
    it('keeps three free notes of the same author in the same book', async () => {
      for (const id of ['note-1', 'note-2', 'note-3']) {
        await notes.save(aNote({ id, kind: 'FREE', userId: AUTHOR_ID }));
      }

      expect(notes.saved).toHaveLength(3);
      expect(notes.saved.map((note) => note.planItemId)).toEqual([
        null,
        null,
        null,
      ]);
    });

    it('does not reject a free note when another author already has one', async () => {
      await notes.save(
        aNote({ id: 'note-1', kind: 'FREE', userId: AUTHOR_ID }),
      );

      await expect(
        notes.save(
          aNote({ id: 'note-2', kind: 'FREE', userId: OTHER_AUTHOR_ID }),
        ),
      ).resolves.toBeTruthy();
    });

    it('lets an author have a plan note and free notes at the same time', async () => {
      await notes.save(
        aNote({ id: 'note-plan', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );
      await notes.save(
        aNote({ id: 'note-free-1', kind: 'FREE', userId: AUTHOR_ID }),
      );
      await notes.save(
        aNote({ id: 'note-free-2', kind: 'FREE', userId: AUTHOR_ID }),
      );

      expect(notes.saved).toHaveLength(3);
    });
  });

  // Regra 39
  describe('byPlanItemAndUser', () => {
    it('returns the note of that plan item and that author', async () => {
      const mine = aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID });
      await notes.save(mine);

      await expect(
        notes.byPlanItemAndUser(PLAN_ITEM_ID, AUTHOR_ID),
      ).resolves.toEqual(mine);
    });

    it('returns null when that author has not written there', async () => {
      await notes.save(
        aNote({ planItemId: PLAN_ITEM_ID, userId: OTHER_AUTHOR_ID }),
      );

      await expect(
        notes.byPlanItemAndUser(PLAN_ITEM_ID, AUTHOR_ID),
      ).resolves.toBeNull();
    });

    it('never returns the note of another author on the same plan item', async () => {
      await notes.save(
        aNote({ planItemId: PLAN_ITEM_ID, userId: OTHER_AUTHOR_ID }),
      );
      const mine = aNote({ planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID });
      await notes.save(mine);

      const found = await notes.byPlanItemAndUser(PLAN_ITEM_ID, AUTHOR_ID);

      expect(found?.id).toBe(mine.id);
      expect(found?.userId).toBe(AUTHOR_ID);
    });

    it('never returns the note of the same author on another plan item', async () => {
      await notes.save(
        aNote({ planItemId: OTHER_PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      await expect(
        notes.byPlanItemAndUser(PLAN_ITEM_ID, AUTHOR_ID),
      ).resolves.toBeNull();
    });

    // ⚠️ A ARQUIVADA TAMBÉM. O índice único não distingue status: esconder a
    // arquivada aqui faria o upsert do dia tentar criar uma segunda nota e
    // bater no índice — 409 permanente na anotação do dia.
    it('returns the note even when it is archived', async () => {
      const archived = aNote({
        planItemId: PLAN_ITEM_ID,
        userId: AUTHOR_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await notes.save(archived);

      const found = await notes.byPlanItemAndUser(PLAN_ITEM_ID, AUTHOR_ID);

      expect(found).toEqual(archived);
      expect(found?.status).toBe('ARCHIVED');
    });

    // `null` não é um valor procurável: quem chama isto está atrás da nota do
    // DIA. As avulsas se acham por outro caminho (Tarefa 10).
    it('returns null for a planItemId that was never used', async () => {
      await notes.save(aNote({ kind: 'FREE', userId: AUTHOR_ID }));

      await expect(
        notes.byPlanItemAndUser('plan-ghost', AUTHOR_ID),
      ).resolves.toBeNull();
    });

    /**
     * Divergência latente fake × Postgres, da classe do ADR 0007.
     *
     * No banco, `WHERE "planItemId" = NULL` não devolve linha nenhuma — `NULL`
     * não é igual a nada, nem a `NULL`. Um fake que compare `null === null` com
     * `Array.prototype.find` devolveria a primeira nota FREE do autor, e um
     * UseCase futuro que caísse aqui passaria verde no teste e leria a nota
     * errada em produção.
     *
     * É inalcançável pelos tipos do port (`planItemId: string`) — e é
     * exatamente por isso que fica pinado: o compilador não guarda esta porta,
     * então o teste guarda.
     */
    it('returns null for a null planItemId, like WHERE "planItemId" = NULL does', async () => {
      await notes.save(
        aNote({ id: 'note-free', kind: 'FREE', userId: AUTHOR_ID }),
      );

      await expect(
        notes.byPlanItemAndUser(null as unknown as string, AUTHOR_ID),
      ).resolves.toBeNull();
    });
  });

  // Regra 29 (Tarefa 09) — `byId` não esconde nada: quem decide o que fazer com
  // uma nota arquivada é o `noteForAuthor`, não o repositório.
  describe('byId', () => {
    it('returns the note of that id', async () => {
      const note = aNote({ id: 'note-x', kind: 'FREE', userId: AUTHOR_ID });
      await notes.save(note);

      await expect(notes.byId('note-x')).resolves.toEqual(note);
    });

    it('returns null for an id that was never saved', async () => {
      await notes.save(aNote({ id: 'note-x', kind: 'FREE' }));

      await expect(notes.byId('note-fantasma')).resolves.toBeNull();
    });

    // ⚠️ A ARQUIVADA TAMBÉM. Esconder aqui faria o `archiveNote` de uma nota já
    // arquivada cair no ramo "inexistente" por acidente e não por decisão — e
    // o `noteForAuthor` perderia a chance de tratar os dois casos igual DE
    // PROPÓSITO (regra 2).
    it('returns the note even when it is archived', async () => {
      const archived = aNote({
        id: 'note-x',
        kind: 'FREE',
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await notes.save(archived);

      const found = await notes.byId('note-x');

      expect(found).toEqual(archived);
      expect(found?.status).toBe('ARCHIVED');
    });

    it('does not let the caller corrupt the store through the note it read', async () => {
      await notes.save(aNote({ id: 'note-x', kind: 'FREE', doc: aDoc('um') }));

      const first = required(await notes.byId('note-x'));
      first.title = 'adulterado';
      const paragraph = first.doc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      const second = required(await notes.byId('note-x'));
      expect(second.title).not.toBe('adulterado');
      expect(JSON.stringify(second.doc)).not.toContain('adulterado');
    });
  });

  describe('update', () => {
    // Regra 30 — a semântica do Prisma: só as chaves presentes mexem.
    it('applies only the keys present in the patch', async () => {
      const note = aNote({
        id: 'note-x',
        kind: 'FREE',
        title: 'Sobre o anel',
        reference: 'p. 45',
      });
      await notes.save(note);

      const updated = await notes.update('note-x', { title: 'Sobre o poder' });

      expect(updated.title).toBe('Sobre o poder');
      expect(updated.reference).toBe('p. 45');
      expect(updated.plainText).toBe(note.plainText);
      expect(required(notes.saved[0]).title).toBe('Sobre o poder');
    });

    // Regra 30 — `undefined` é "não mexe", NÃO "apague". O spread do JS não faz
    // essa distinção sozinho; é o `withoutUndefined` que a faz.
    it('treats an undefined value in the patch as "do not touch"', async () => {
      await notes.save(
        aNote({ id: 'note-x', kind: 'FREE', reference: 'p. 45' }),
      );

      const updated = await notes.update('note-x', { reference: undefined });

      expect(updated.reference).toBe('p. 45');
    });

    // Regra 30 — e `null` GRAVA nulo, que é como o `editNote` limpa a
    // referência.
    it('writes null when the patch says null', async () => {
      await notes.save(
        aNote({ id: 'note-x', kind: 'FREE', reference: 'p. 45' }),
      );

      const updated = await notes.update('note-x', { reference: null });

      expect(updated.reference).toBeNull();
      expect(required(notes.saved[0]).reference).toBeNull();
    });

    /**
     * ⚠️ O buraco que o TIPO SOZINHO não fecha — e é por isso que o `update`
     * copia campo a campo em vez de espalhar o patch.
     *
     * A checagem de propriedade em excesso do TypeScript só vale para **objeto
     * literal fresco**: `update(id, { userId })` é recusado (o teste abaixo
     * prova os 7 casos), mas um patch montado por **variável** atravessa sem o
     * compilador dizer nada — e um `{ ...existing, ...patch }` obedeceria,
     * enquanto o `toUpdateData` do Prisma ignoraria em silêncio. Seria a
     * divergência do §7.1 de volta, na direção que a suíte não vê.
     *
     * Não há caminho vivo hoje (os dois chamadores mandam literal correto), e é
     * exatamente por isso que o teste existe: o dia em que houver, ninguém
     * lembra deste parágrafo.
     */
    it('never changes the authorship, even for a patch the compiler cannot check', async () => {
      await notes.save(
        aNote({
          id: 'note-x',
          kind: 'FREE',
          userId: AUTHOR_ID,
          title: 'Sobre o anel',
        }),
      );

      // Variável, não literal: é o que desliga a checagem de excesso.
      const loose = { title: 'Sobre o poder', userId: OTHER_AUTHOR_ID };

      const updated = await notes.update('note-x', loose);

      // O campo patcheável mudou...
      expect(updated.title).toBe('Sobre o poder');
      // ...e a AUTORIA não, nem no que voltou nem no que ficou no store.
      expect(updated.userId).toBe(AUTHOR_ID);
      expect(required(notes.saved[0]).userId).toBe(AUTHOR_ID);
    });

    /**
     * ⚠️ O assunto deste teste é o COMPILADOR, e a asserção que morde é o
     * `@ts-expect-error` — `pnpm -r typecheck` falha se qualquer uma daquelas
     * linhas passar a compilar.
     *
     * Era daqui que saía a quinta aparição da classe do ADR 0007: com
     * `Partial<Note>` no port, `update(id, { userId: 'x' })` trocava a autoria
     * no fake e era no-op silencioso no Postgres (o `toUpdateData` tinha
     * allowlist). A saída não foi cobrir a divergência com teste, foi **tirar o
     * estado ilegal do tipo**: o `NotePatch` não tem identidade, tenant, autoria
     * nem âncora, então não há o que divergir — e é por isso que o índice único
     * só é conferido no `save`. → CONVENCOES-CODIGO §7.1.
     */
    it('refuses, at compile time, a patch that would move the note or change its author', () => {
      // @ts-expect-error `id` não é patcheável: trocaria a chave primária.
      const changeId: NotePatch = { id: 'note-outro' };
      // @ts-expect-error `userId` não é patcheável: autoria não se transfere.
      const changeAuthor: NotePatch = { userId: OTHER_AUTHOR_ID };
      // @ts-expect-error `clubId` não é patcheável: conteúdo não muda de clube.
      const changeClub: NotePatch = { clubId: OTHER_CLUB_ID };
      // @ts-expect-error `bookId` não é patcheável, pelo mesmo motivo.
      const changeBook: NotePatch = { bookId: OTHER_BOOK_ID };
      // @ts-expect-error `planItemId` não é patcheável: a nota não muda de dia.
      const moveDay: NotePatch = { planItemId: PLAN_ITEM_ID };
      // @ts-expect-error `kind` não é patcheável: avulsa não vira nota do dia.
      const changeKind: NotePatch = { kind: 'FREE' };
      // @ts-expect-error `createdAt` não é patcheável: nascer é uma vez só.
      const rewriteBirth: NotePatch = { createdAt: new Date(CREATED_ISO) };

      // Formalidade de runtime — o veredito acima é do tsc.
      expect([
        changeId,
        changeAuthor,
        changeClub,
        changeBook,
        moveDay,
        changeKind,
        rewriteBirth,
      ]).toHaveLength(7);
    });

    // Regra 31 — contrato do fake, não regra de domínio: quem cair aqui
    // atualizou uma linha que não existe, e isso é bug de código.
    it('signals an unknown id with a raw Error, never a domain error', async () => {
      const error = await caught(notes.update('note-fantasma', { title: 'x' }));

      expect(error.name).toBe('Error');
      expect(error.message).toMatch(/never saved/);
    });

    // Regra 33 — mesmo padrão do `saveCalls` e do `compareCalls` do
    // PasswordHasherFake (CONVENCOES-CODIGO §6.4): sem contador, um `saved`
    // inalterado não distingue "não chamou o repo" de "chamou e o patch não
    // mudou nada" — e é essa a diferença que a regra 17 do `editNote` afirma.
    it('counts every update call, including the one it refused', async () => {
      expect(notes.updateCalls).toBe(0);

      await notes.save(
        aNote({ id: 'note-a', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      await notes.update('note-a', { title: 'Cap. 3' });
      await expect(
        notes.update('note-fantasma', { title: 'Cap. 4' }),
      ).rejects.toThrow(/never saved/);

      expect(notes.updateCalls).toBe(2);
    });

    it('counts a call it refused for an unknown id too', async () => {
      await expect(
        notes.update('note-fantasma', { title: 'x' }),
      ).rejects.toThrow();

      expect(notes.updateCalls).toBe(1);
    });

    // O clone corta o aliasing de `Date` que venha pelo patch — o Prisma nunca
    // deixaria o chamador guardar referência para dentro da linha.
    it('does not let the caller corrupt the store through a Date in the patch', async () => {
      await notes.save(aNote({ id: 'note-x', kind: 'FREE' }));
      const updatedAt = new Date('2026-03-01T00:00:00.000Z');

      await notes.update('note-x', { updatedAt });
      updatedAt.setFullYear(1999);

      expect(required(notes.saved[0]).updatedAt).toEqual(
        new Date('2026-03-01T00:00:00.000Z'),
      );
    });

    it('does not let the caller corrupt the stored doc through the tree in the patch', async () => {
      await notes.save(aNote({ id: 'note-x', kind: 'FREE' }));
      const doc = aDoc('original');

      await notes.update('note-x', { doc });
      const paragraph = doc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain(
        'original',
      );
      expect(JSON.stringify(required(notes.saved[0]).doc)).not.toContain(
        'adulterado',
      );
    });
  });

  /**
   * O índice único é conferido **só no `save`**, e é o `NotePatch` que autoriza
   * essa simplificação: sem `planItemId` e sem `userId` no patch, nenhum
   * `update` alcança um par que outra nota ocupa. O que ficou aqui é o caso que
   * continua alcançável e que precisa continuar PASSANDO: reescrever a nota do
   * dia que já ocupa o próprio par.
   */
  describe('update never trips over the unique pair', () => {
    // Editar o texto da nota do dia é o caso normal, e ela já ocupa o par.
    it('lets a note keep its own pair while other fields change', async () => {
      await notes.save(
        aNote({ id: 'note-a', planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID }),
      );

      const updated = await notes.update('note-a', {
        doc: aDoc('reescrevi tudo'),
      });

      expect(JSON.stringify(updated.doc)).toContain('reescrevi tudo');
      expect(updated.planItemId).toBe(PLAN_ITEM_ID);
      expect(notes.saved).toHaveLength(1);
    });

    // N avulsas do mesmo autor convivem (`NULL` não colide), e editar uma não
    // pode acordar a checagem do par.
    it('edits one of many free notes by the same author', async () => {
      await notes.save(
        aNote({ id: 'note-a', kind: 'FREE', userId: AUTHOR_ID }),
      );
      await notes.save(
        aNote({ id: 'note-b', kind: 'FREE', userId: AUTHOR_ID }),
      );

      const updated = await notes.update('note-b', { title: 'outro título' });

      expect(updated.title).toBe('outro título');
      expect(notes.saved).toHaveLength(2);
    });
  });

  // Clona nos dois sentidos, como os outros fakes: nem o chamador contamina o
  // store, nem o store devolve referência sua. O Prisma devolve `Date` nova e
  // JSON reparseado a cada leitura.
  describe('fidelity of what crosses the boundary', () => {
    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const createdAt = new Date(CREATED_ISO);
      await notes.save(aNote({ createdAt }));

      createdAt.setFullYear(1999);

      expect(required(notes.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('does not let the caller corrupt the store through the note it got back', async () => {
      const returned = await notes.save(aNote());

      returned.updatedAt.setFullYear(1999);

      expect(required(notes.saved[0]).updatedAt).toEqual(new Date(CREATED_ISO));
    });

    it('keeps a null archivedAt null instead of turning it into the epoch', async () => {
      await notes.save(aNote({ archivedAt: null }));

      expect(required(notes.saved[0]).archivedAt).toBeNull();
    });

    it('clones the archivedAt of an archived note', async () => {
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');
      await notes.save(aNote({ status: 'ARCHIVED', archivedAt }));

      archivedAt.setFullYear(1999);

      expect(required(notes.saved[0]).archivedAt).toEqual(
        new Date('2026-02-01T00:00:00.000Z'),
      );
    });

    // O `doc` é uma árvore, e é o único campo mutável por dentro. Sem clone
    // profundo, um UseCase que reusasse o objeto do input mexeria no que já
    // está "no banco" — algo que o Prisma nunca deixaria acontecer.
    it('does not let the caller corrupt the stored doc through the tree it saved', async () => {
      const doc = aDoc('original');
      await notes.save(aNote({ doc }));

      const paragraph = doc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      expect(required(notes.saved[0]).plainText).toBe('original');
      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain(
        'original',
      );
      expect(JSON.stringify(required(notes.saved[0]).doc)).not.toContain(
        'adulterado',
      );
    });

    it('returns a different Date instance on every read', async () => {
      await notes.save(aNote());

      const first = required(notes.saved[0]);
      const second = required(notes.saved[0]);

      expect(first.createdAt).not.toBe(second.createdAt);
      expect(first.createdAt).toEqual(second.createdAt);
    });
  });

  /**
   * Regras 1–11 (Tarefa 10) — o `find` do acervo do clube.
   *
   * O `clubId` é obrigatório porque é o corte de tenant, e todo filtro entra em
   * **AND** com ele. O port não promete ordem: quem ordena é o `listNotes`.
   */
  describe('find', () => {
    // Fixture como FACTORY, nunca `const` de describe (CONVENCOES-CODIGO §6.6):
    // um objeto compartilhado entre testes é estado escondido, e o `doc` é
    // mutável por dentro.
    function aFreeNote(overrides: Partial<Note> = {}): Note {
      return aNote({
        kind: 'FREE',
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        doc: aDoc('o poder do anel'),
        ...overrides,
      });
    }

    function anArchivedFreeNote(overrides: Partial<Note> = {}): Note {
      return aFreeNote({
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        ...overrides,
      });
    }

    /**
     * Regra 1 — o `clubId` é **sempre** AND.
     *
     * A nota gêmea do outro clube casa TODOS os outros filtros de propósito: é
     * o que faz este teste falhar se o corte de tenant deixar de ser aplicado
     * (ou se algum filtro passar a substituí-lo em vez de somar-se a ele).
     */
    it('never returns a note of another club, even when every other filter matches', async () => {
      await notes.save(aFreeNote({ id: 'theirs', clubId: OTHER_CLUB_ID }));
      await notes.save(aFreeNote({ id: 'mine' }));

      const found = await notes.find({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        authorId: AUTHOR_ID,
        kind: 'FREE',
        text: 'poder',
      });

      expect(found.map((note) => note.id)).toEqual(['mine']);
    });

    // Regra 2
    it('filters by bookId', async () => {
      await notes.save(aFreeNote({ id: 'other-book', bookId: OTHER_BOOK_ID }));
      await notes.save(aFreeNote({ id: 'this-book' }));

      const found = await notes.find({ clubId: CLUB_ID, bookId: BOOK_ID });

      expect(found.map((note) => note.id)).toEqual(['this-book']);
    });

    // Regra 3 — o `authorId` do filtro é o `userId` da nota: o AUTOR.
    it('filters by authorId', async () => {
      await notes.save(aFreeNote({ id: 'theirs', userId: OTHER_AUTHOR_ID }));
      await notes.save(aFreeNote({ id: 'mine' }));

      const found = await notes.find({ clubId: CLUB_ID, authorId: AUTHOR_ID });

      expect(found.map((note) => note.id)).toEqual(['mine']);
    });

    // Regra 4 — nos dois sentidos, senão um `find` que ignorasse o `kind`
    // passaria na metade dos casos.
    it.each([
      ['PLAN', 'day-note'],
      ['FREE', 'free-note'],
    ] as const)('filters by kind %s', async (kind, expected) => {
      await notes.save(aFreeNote({ id: 'free-note' }));
      await notes.save(
        aFreeNote({ id: 'day-note', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );

      const found = await notes.find({ clubId: CLUB_ID, kind });

      expect(found.map((note) => note.id)).toEqual([expected]);
    });

    // Regra 5
    it('filters by planItemId', async () => {
      await notes.save(
        aFreeNote({
          id: 'day-2',
          kind: 'PLAN',
          planItemId: OTHER_PLAN_ITEM_ID,
        }),
      );
      await notes.save(
        aFreeNote({ id: 'day-1', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );

      const found = await notes.find({
        clubId: CLUB_ID,
        planItemId: PLAN_ITEM_ID,
      });

      expect(found.map((note) => note.id)).toEqual(['day-1']);
    });

    /**
     * Regra 5, a metade que o `planItemId` da nota AVULSA expõe: no Postgres
     * `WHERE "planItemId" = 'x'` contra uma coluna nula é **falso** — `NULL` não
     * é igual a nada, nem a `'x'` —, então a avulsa fica fora de todo filtro por
     * dia de leitura.
     *
     * `planItemId` é o único campo filtrável que pode ser nulo, e um fake que
     * tratasse "coluna nula" como "casa qualquer filtro" seria infiel na direção
     * PERMISSIVA: o teste passaria verde e a tela do dia mostraria as anotações
     * avulsas do clube junto com as do trecho lido. É a classe do ADR 0007, e é
     * a irmã do teste do `byPlanItemAndUser` para `= NULL`.
     */
    it('never matches a free note when the filter asks for a planItemId, just like WHERE "planItemId" = \'x\'', async () => {
      await notes.save(aFreeNote({ id: 'avulsa', planItemId: null }));
      await notes.save(
        aFreeNote({ id: 'do-dia', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );

      const found = await notes.find({
        clubId: CLUB_ID,
        planItemId: PLAN_ITEM_ID,
      });

      expect(found.map((note) => note.id)).toEqual(['do-dia']);
    });

    // Regra 6 — `ILIKE` compara sem olhar caixa, e a caixa pode divergir dos
    // dois lados: na consulta e no texto gravado.
    it.each(['PODER', 'poder', 'PoDeR'])(
      'matches the plainText case-insensitively when the query is %s',
      async (text) => {
        await notes.save(aFreeNote({ id: 'note-poder' }));

        const found = await notes.find({ clubId: CLUB_ID, text });

        expect(found.map((note) => note.id)).toEqual(['note-poder']);
      },
    );

    // Regra 6 — e o outro lado: o texto gravado em caixa alta.
    it('matches a lowercase query against an uppercase plainText', async () => {
      await notes.save(
        aFreeNote({ id: 'note-grito', doc: aDoc('O PODER DO ANEL') }),
      );

      const found = await notes.find({ clubId: CLUB_ID, text: 'poder' });

      expect(found.map((note) => note.id)).toEqual(['note-grito']);
    });

    // Regra 6 — e não casa o que não está lá. Sem este teste, um `find` que
    // ignorasse o `text` passaria em todos os de cima.
    it('does not match a word that is absent from the plainText', async () => {
      await notes.save(aFreeNote({ id: 'note-poder' }));

      await expect(
        notes.find({ clubId: CLUB_ID, text: 'hobbit' }),
      ).resolves.toEqual([]);
    });

    /**
     * Regra 7 — o `ILIKE` do Postgres **não** ignora acento:
     * `'coração' ILIKE '%coracao%'` é **falso**.
     *
     * Um fake que normalizasse acentos seria infiel na direção PERMISSIVA — o
     * teste passaria verde e a busca real não acharia nada. É a classe do
     * ADR 0007. Busca sem acento exigiria a extensão `unaccent` do Postgres: é
     * a Tarefa 29, com migration e ADR próprios.
     */
    it.each([
      ['coracao', 'coração'],
      ['coração', 'coracao'],
    ])(
      'does not match the query %s against the stored %s, just like ILIKE',
      async (text, stored) => {
        await notes.save(
          aFreeNote({ id: 'note-acento', doc: aDoc(`o ${stored} manda`) }),
        );

        await expect(notes.find({ clubId: CLUB_ID, text })).resolves.toEqual(
          [],
        );
      },
    );

    // Regra 7, o lado positivo: a caixa continua sendo dobrada NO caractere
    // acentuado (`Ç` acha `ç`). Sem este teste, um fake que só comparasse ASCII
    // passaria no de cima por acidente.
    it('matches an accented word when the query carries the same accent', async () => {
      await notes.save(
        aFreeNote({ id: 'note-acento', doc: aDoc('o coração manda') }),
      );

      const found = await notes.find({ clubId: CLUB_ID, text: 'CORAÇÃO' });

      expect(found.map((note) => note.id)).toEqual(['note-acento']);
    });

    /**
     * Regra 8 — a busca casa **só** o `plainText`. É decisão fechada do MVP 2
     * ("busca é `ILIKE` no `plainText`/`commentText`") e a spec de tarefa não a
     * reabre.
     *
     * A nota abaixo tem a palavra no `title` **e** na `reference` de propósito,
     * e não a tem no `doc`: é o que faz um `find` mais abrangente FALHAR aqui.
     */
    it('never matches the title or the reference, only the plainText', async () => {
      await notes.save(
        aFreeNote({
          id: 'note-titulo',
          title: 'Sobre o poder',
          reference: 'cap. do poder',
          doc: aDoc('nada a ver com a palavra procurada'),
        }),
      );

      await expect(
        notes.find({ clubId: CLUB_ID, text: 'poder' }),
      ).resolves.toEqual([]);
    });

    // Regra 9 — cada nota erra em UM filtro só, então cada filtro que deixasse
    // de ser aplicado traria uma nota a mais.
    it('combines every filter with AND', async () => {
      await notes.save(aFreeNote({ id: 'wrong-club', clubId: OTHER_CLUB_ID }));
      await notes.save(aFreeNote({ id: 'wrong-book', bookId: OTHER_BOOK_ID }));
      await notes.save(
        aFreeNote({ id: 'wrong-author', userId: OTHER_AUTHOR_ID }),
      );
      await notes.save(
        aFreeNote({ id: 'wrong-kind', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );
      await notes.save(
        aFreeNote({ id: 'wrong-text', doc: aDoc('nada a ver') }),
      );
      await notes.save(aFreeNote({ id: 'the-one' }));

      const found = await notes.find({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        authorId: AUTHOR_ID,
        kind: 'FREE',
        text: 'poder',
      });

      expect(found.map((note) => note.id)).toEqual(['the-one']);
    });

    // Regra 10 — `status` ausente é "os dois", como no `BookFilter`. Quem
    // esconde a arquivada é o UseCase, não o repositório.
    //
    // Ordena antes de comparar: o assunto aqui é COBERTURA de status, não a
    // ordem — que já tem dois testes dedicados (`enumerates in reverse
    // insertion order`). Pinar a ordem aqui faria este teste quebrar por um
    // motivo que não tem nada a ver com o nome dele se a armadilha do fake um
    // dia virar outro critério legítimo.
    it('returns both statuses when the filter carries no status', async () => {
      await notes.save(anArchivedFreeNote({ id: 'archived' }));
      await notes.save(aFreeNote({ id: 'active' }));

      const found = await notes.find({ clubId: CLUB_ID });

      expect(found.map((note) => note.id).sort()).toEqual([
        'active',
        'archived',
      ]);
    });

    // Regra 10
    it('returns only the ACTIVE ones when the filter says ACTIVE', async () => {
      await notes.save(anArchivedFreeNote({ id: 'archived' }));
      await notes.save(aFreeNote({ id: 'active' }));

      const found = await notes.find({ clubId: CLUB_ID, status: 'ACTIVE' });

      expect(found.map((note) => note.id)).toEqual(['active']);
    });

    // Regra 10 — e o outro sentido, senão um `find` que ignorasse o `status`
    // passaria no de cima quando só houvesse nota ativa.
    it('returns only the ARCHIVED ones when the filter says ARCHIVED', async () => {
      await notes.save(anArchivedFreeNote({ id: 'archived' }));
      await notes.save(aFreeNote({ id: 'active' }));

      const found = await notes.find({ clubId: CLUB_ID, status: 'ARCHIVED' });

      expect(found.map((note) => note.id)).toEqual(['archived']);
    });

    /**
     * Regra 11 — **a armadilha deliberada.** O fake enumera na ordem INVERSA à
     * de inserção, e isso NÃO é bug: a Tarefa 07 descobriu um teste de ordenação
     * que passava com a implementação errada porque os fixtures estavam na ordem
     * esperada. Com o fake invertido, um `listNotes` sem `sort` falha.
     *
     * Três notas, e não duas: com duas, "invertido" e "ordenado por id
     * decrescente" dariam o mesmo resultado. A pré-condição do `saved` é
     * afirmada porque o teste depende dela.
     */
    it('enumerates in reverse insertion order', async () => {
      await notes.save(aFreeNote({ id: 'b-inserida-1a' }));
      await notes.save(aFreeNote({ id: 'a-inserida-2a' }));
      await notes.save(aFreeNote({ id: 'c-inserida-3a' }));

      expect(notes.saved.map((note) => note.id)).toEqual([
        'b-inserida-1a',
        'a-inserida-2a',
        'c-inserida-3a',
      ]);

      const found = await notes.find({ clubId: CLUB_ID });

      expect(found.map((note) => note.id)).toEqual([
        'c-inserida-3a',
        'a-inserida-2a',
        'b-inserida-1a',
      ]);
    });

    it('returns an empty list for a club with no notes', async () => {
      await notes.save(aFreeNote({ id: 'theirs', clubId: OTHER_CLUB_ID }));

      await expect(notes.find({ clubId: CLUB_ID })).resolves.toEqual([]);
    });

    // Clona na saída, como as outras leituras: o `listNotes` ordena o array que
    // recebe daqui, e o store não pode sentir isso.
    it('does not let the caller corrupt the store through what find returned', async () => {
      await notes.save(aFreeNote({ id: 'note-x' }));

      const first = required((await notes.find({ clubId: CLUB_ID }))[0]);
      first.title = 'adulterado';
      const paragraph = first.doc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      const second = required((await notes.find({ clubId: CLUB_ID }))[0]);
      expect(second.title).not.toBe('adulterado');
      expect(JSON.stringify(second.doc)).not.toContain('adulterado');
    });

    // Mesmo padrão do `saveCalls` e do `compareCalls` do PasswordHasherFake
    // (CONVENCOES-CODIGO §6.4): é o que deixa o teste do `listNotes` afirmar
    // "o corte veio ANTES da consulta" sem depender do resultado.
    it('counts every find call', async () => {
      expect(notes.findCalls).toBe(0);

      await notes.find({ clubId: CLUB_ID });
      await notes.find({ clubId: OTHER_CLUB_ID });

      expect(notes.findCalls).toBe(2);
    });

    // E guarda o filtro de cada chamada: é o que prova que o UseCase manda UM
    // `NoteFilter` só, com `status: 'ACTIVE'` e sem chave à toa.
    it('records the filter of every find call', async () => {
      await notes.find({ clubId: CLUB_ID, status: 'ACTIVE' });
      await notes.find({ clubId: OTHER_CLUB_ID, text: 'poder' });

      expect(notes.findFilters).toStrictEqual([
        { clubId: CLUB_ID, status: 'ACTIVE' },
        { clubId: OTHER_CLUB_ID, text: 'poder' },
      ]);
    });

    // O registro é uma CÓPIA: um chamador que reusasse o objeto do filtro entre
    // duas consultas reescreveria o histórico e o teste do UseCase mentiria.
    it('records a copy of the filter, not the caller object', async () => {
      const filter = { clubId: CLUB_ID, text: 'poder' };

      await notes.find(filter);
      filter.text = 'adulterado';

      expect(notes.findFilters).toStrictEqual([
        { clubId: CLUB_ID, text: 'poder' },
      ]);
    });
  });

  /**
   * Regras 11–12 (Tarefa 10) — os pares (dia de leitura, autor) das notas
   * ATIVAS de um livro.
   *
   * Método próprio, e não um `find` seguido de `map`, porque o `doc` é a maior
   * coluna da tabela: carregar as ~60 notas de um livro inteiras para desenhar
   * uma sobreposição de autoria seria trafegar o acervo do clube.
   */
  describe('planItemWritersByBook', () => {
    function aDayNote(overrides: Partial<Note> = {}): Note {
      return aNote({
        kind: 'PLAN',
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        planItemId: PLAN_ITEM_ID,
        ...overrides,
      });
    }

    // Regra 12
    it('returns the (plan item, author) pair of a note of the book', async () => {
      await notes.save(aDayNote({ id: 'note-a' }));

      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([
        { planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID },
      ]);
    });

    // Regra 12 — dois autores no mesmo dia dão DOIS pares. Agrupar é do
    // UseCase; o repositório devolve os pares crus.
    //
    // `arrayContaining` + `toHaveLength`, e não uma lista na ordem exata: o
    // assunto é "um par por autor", e a ordem já tem teste dedicado logo abaixo
    // (`enumerates in reverse insertion order`).
    it('returns one pair per author on the same plan item', async () => {
      await notes.save(aDayNote({ id: 'note-a', userId: AUTHOR_ID }));
      await notes.save(aDayNote({ id: 'note-b', userId: OTHER_AUTHOR_ID }));

      const found = await notes.planItemWritersByBook(BOOK_ID);

      expect(found).toHaveLength(2);
      expect(found).toEqual(
        expect.arrayContaining([
          { planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID },
          { planItemId: PLAN_ITEM_ID, userId: OTHER_AUTHOR_ID },
        ]),
      );
    });

    // Regra 12 — a avulsa não tem dia de leitura, então não entra. No Postgres
    // é o `WHERE "planItemId" IS NOT NULL`.
    it('never returns a free note: it has no plan item', async () => {
      await notes.save(
        aDayNote({ id: 'note-free', kind: 'FREE', planItemId: null }),
      );

      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    // Regra 12 — arquivada é invisível, aqui como em toda leitura de MVP 1.
    it('never returns an archived note', async () => {
      await notes.save(
        aDayNote({
          id: 'note-arquivada',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    // Regra 12 — o corte é o LIVRO. A nota abaixo mantém o `planItemId`
    // procurado de propósito: é o que faz um filtro por dia de leitura, em vez
    // de por livro, falhar aqui.
    it('never returns a note of another book', async () => {
      await notes.save(
        aDayNote({ id: 'note-outro-livro', bookId: OTHER_BOOK_ID }),
      );

      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    it('returns an empty list for a book nobody wrote in', async () => {
      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    /**
     * Regra 11 — a armadilha deliberada vale para os DOIS métodos. Quem montar
     * a resposta do `listPlanItemWriters` a partir desta ordem tem de falhar: a
     * ordem do array é a do PLANO.
     */
    it('enumerates in reverse insertion order', async () => {
      await notes.save(aDayNote({ id: 'note-1', planItemId: PLAN_ITEM_ID }));
      await notes.save(
        aDayNote({ id: 'note-2', planItemId: OTHER_PLAN_ITEM_ID }),
      );
      await notes.save(
        aDayNote({ id: 'note-3', planItemId: THIRD_PLAN_ITEM_ID }),
      );

      expect(notes.saved.map((note) => note.id)).toEqual([
        'note-1',
        'note-2',
        'note-3',
      ]);

      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([
        { planItemId: THIRD_PLAN_ITEM_ID, userId: AUTHOR_ID },
        { planItemId: OTHER_PLAN_ITEM_ID, userId: AUTHOR_ID },
        { planItemId: PLAN_ITEM_ID, userId: AUTHOR_ID },
      ]);
    });

    // Existe pelo mesmo motivo do `findCalls`: pinar que o corte de tenant do
    // `listPlanItemWriters` roda ANTES de qualquer leitura de nota.
    it('counts every planItemWritersByBook call', async () => {
      expect(notes.planItemWritersByBookCalls).toBe(0);

      await notes.planItemWritersByBook(BOOK_ID);
      await notes.planItemWritersByBook(OTHER_BOOK_ID);

      expect(notes.planItemWritersByBookCalls).toBe(2);
    });
  });

  /**
   * O método da guarda do `replacePlanItems` (Tarefa 11). O que o separa do
   * `planItemWritersByBook` é uma linha só — ele é **cego a `status`** —, e é
   * essa linha que os testes daqui existem para pinar: quem barra a remoção de
   * um dia é a FK, e a FK não olha status.
   */
  describe('planItemIdsWithAnyNote', () => {
    function aDayNote(overrides: Partial<Note> = {}): Note {
      return aNote({
        kind: 'PLAN',
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        planItemId: PLAN_ITEM_ID,
        ...overrides,
      });
    }

    it('returns the plan item id of a day that has a note', async () => {
      await notes.save(aDayNote({ id: 'note-a' }));

      await expect(
        notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]),
      ).resolves.toEqual([PLAN_ITEM_ID]);
    });

    // ⚠️ A REGRA QUE SEPARA ESTE MÉTODO DO `planItemWritersByBook`. Uma nota
    // arquivada ainda tem `planItemId` preenchido no banco, então a FK recusa
    // a remoção do dia. Uma guarda que filtrasse ACTIVE liberaria a operação e
    // o admin receberia um 500 de FK em vez do 400 que explica.
    it('finds a day whose only note is archived', async () => {
      await notes.save(
        aDayNote({
          id: 'note-arquivada',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]),
      ).resolves.toEqual([PLAN_ITEM_ID]);
    });

    it('omits a day that nobody wrote in', async () => {
      await notes.save(aDayNote({ id: 'note-a', planItemId: PLAN_ITEM_ID }));

      await expect(
        notes.planItemIdsWithAnyNote([OTHER_PLAN_ITEM_ID]),
      ).resolves.toEqual([]);
    });

    // Ordenado antes de comparar: o assunto é QUAIS dias, não a ordem — e a
    // enumeração do fake é a armadilha invertida do §7.2.
    it('returns only the asked ids that have a note', async () => {
      await notes.save(aDayNote({ id: 'note-a', planItemId: PLAN_ITEM_ID }));
      await notes.save(
        aDayNote({ id: 'note-c', planItemId: THIRD_PLAN_ITEM_ID }),
      );

      const found = await notes.planItemIdsWithAnyNote([
        PLAN_ITEM_ID,
        OTHER_PLAN_ITEM_ID,
        THIRD_PLAN_ITEM_ID,
      ]);

      expect([...found].sort()).toEqual(
        [PLAN_ITEM_ID, THIRD_PLAN_ITEM_ID].sort(),
      );
    });

    // É um CONJUNTO: dois autores no mesmo dia dão UM id, não dois. Sem isto a
    // mensagem da guarda diria "2 dias" para um dia só.
    it('returns one id per day, not one per note', async () => {
      await notes.save(aDayNote({ id: 'note-a', userId: AUTHOR_ID }));
      await notes.save(aDayNote({ id: 'note-b', userId: OTHER_AUTHOR_ID }));

      await expect(
        notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]),
      ).resolves.toEqual([PLAN_ITEM_ID]);
    });

    // A avulsa não tem dia de leitura, então nada nela pode barrar a remoção
    // de um dia. No Postgres é o `IN (...)` contra uma coluna nula: falso.
    it('never lets a free note keep a day alive', async () => {
      await notes.save(
        aDayNote({ id: 'note-free', kind: 'FREE', planItemId: null }),
      );

      await expect(
        notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]),
      ).resolves.toEqual([]);
    });

    it('returns an empty list for an empty list of ids', async () => {
      await notes.save(aDayNote({ id: 'note-a' }));

      await expect(notes.planItemIdsWithAnyNote([])).resolves.toEqual([]);
    });

    // Não é escopado por livro nem por clube de propósito: os ids vêm do plano
    // que o `replacePlanItems` acabou de ler do livro já cortado por tenant. A
    // nota abaixo é de OUTRO livro e OUTRO clube, e o dia dela é o pedido —
    // um estado impossível no banco (a FK amarra a nota ao item real), posto
    // aqui só para provar que o método não inventa um segundo corte de tenant.
    it('does not filter by book or club: the ids are already scoped', async () => {
      await notes.save(
        aDayNote({
          id: 'note-outro-livro',
          bookId: OTHER_BOOK_ID,
          clubId: OTHER_CLUB_ID,
        }),
      );

      await expect(
        notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]),
      ).resolves.toEqual([PLAN_ITEM_ID]);
    });

    // Existe pelo mesmo motivo do `findCalls`: pinar que a guarda do
    // `replacePlanItems` roda DEPOIS do corte de tenant — quem não é admin do
    // clube não pode gerar nem uma leitura de nota.
    it('counts every planItemIdsWithAnyNote call', async () => {
      expect(notes.planItemIdsWithAnyNoteCalls).toBe(0);

      await notes.planItemIdsWithAnyNote([PLAN_ITEM_ID]);
      await notes.planItemIdsWithAnyNote([]);

      expect(notes.planItemIdsWithAnyNoteCalls).toBe(2);
    });
  });
});
