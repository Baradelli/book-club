import { beforeEach, describe, expect, it } from 'vitest';

import { NotAMemberError } from '../../domain/errors';
import type { Highlight } from '../../domain/highlight';
import { aHighlight, aMembership, required } from '../../test-support/builders';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListHighlightsInput } from '../list-highlights';
import { ListHighlights } from '../list-highlights';
import type { HighlightFilter } from '../ports/highlight-repository';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_BOOK_ID = 'book-2';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_MEMBER_ID = 'user-other-member';
const YELLOW = '#facc15';
const GREEN = '#22c55e';
const PAGE = 45;
const OTHER_PAGE = 46;

/**
 * ⚠️ **Os ids da ordenação, escolhidos para a implementação ERRADA falhar.**
 *
 * O §7.2 conta duas histórias em que o fixture fazia a ordem errada
 * **coincidir** com a certa — e nas duas o teste tinha o nome certo e não
 * provava nada. Aqui a ordem alfabética dos ids é
 * `aa-mais-antigo < mm-mais-novo < zz-do-meio`, que **não** é a ordem esperada
 * (`mais-novo`, `do-meio`, `mais-antigo`) **nem** a inversa dela — então um
 * `sort` por `id` (nos dois sentidos) falha, e a enumeração do repositório
 * (invertida) e a de inserção também.
 *
 * A precondição é **pinada** em teste (`expect(ID_A < ID_B)`), senão um id
 * renomeado devolve a coincidência em silêncio.
 */
const ID_OLDEST = 'aa-mais-antigo';
const ID_NEWEST = 'mm-mais-novo';
const ID_MIDDLE = 'zz-do-meio';

/** O par do desempate: mesmo `createdAt`, e `TIE_FIRST < TIE_SECOND` por id. */
const TIE_FIRST = 'a-primeiro';
const TIE_SECOND = 'b-segundo';

const OLDEST_AT = new Date('2026-01-01T00:00:00.000Z');
const MIDDLE_AT = new Date('2026-02-01T00:00:00.000Z');
const NEWEST_AT = new Date('2026-03-01T00:00:00.000Z');
const ARCHIVED_AT = new Date('2026-04-01T00:00:00.000Z');
/** Depois de todos os `createdAt`: é o que faz um `sort` por `updatedAt` errar. */
const EDITED_AT = new Date('2026-05-01T00:00:00.000Z');

/**
 * O fake, mais a REFERÊNCIA de cada array que o `find` devolveu **e um snapshot
 * dele no instante do retorno**.
 *
 * A referência é o único jeito de medir "o array devolvido é cópia": o fake
 * monta um array novo a cada chamada, então um `sort` in loco passaria
 * despercebido pelo resultado.
 *
 * ⚠️ **O snapshot é o que deixa o teste provar "não mutou" SEM pinar ordem
 * nenhuma.** A primeira redação comparava o array do repositório com uma lista
 * de ids escrita à mão, e isso pinava a ordem inversa da inserção num teste cujo
 * assunto **não é** a ordem — o corolário do §7.2: o dia em que a armadilha do
 * fake virar outro critério legítimo, esse teste quebraria por um motivo que não
 * tem nada a ver com o nome dele, e quem lesse o vermelho procuraria o bug no
 * lugar errado. Comparando com o snapshot, a asserção é "continua como saiu",
 * qualquer que fosse a ordem em que saiu.
 */
class ArrayRecordingHighlightRepositoryFake extends HighlightRepositoryFake {
  readonly arraysReturnedByFind: Highlight[][] = [];
  /** `[...found]` no instante do retorno — a testemunha de como o array saiu. */
  readonly snapshotsAtReturn: Highlight[][] = [];

  override async find(filter: HighlightFilter): Promise<Highlight[]> {
    const found = await super.find(filter);
    this.arraysReturnedByFind.push(found);
    this.snapshotsAtReturn.push([...found]);
    return found;
  }
}

describe('ListHighlights', () => {
  let memberships: MembershipRepositoryFake;
  let highlights: ArrayRecordingHighlightRepositoryFake;
  let useCase: ListHighlights;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    highlights = new ArrayRecordingHighlightRepositoryFake();
    useCase = new ListHighlights(new AssertMembership(memberships), highlights);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [OTHER_MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
      await memberships.save(
        aMembership({ userId, clubId: OTHER_CLUB_ID, role }),
      );
    }
  });

  // Fixture como FACTORY, nunca `const` de describe (§7.7): um objeto
  // compartilhado entre testes é estado escondido, e o `commentDoc` é uma
  // árvore mutável por dentro.
  function validInput(
    overrides: Partial<ListHighlightsInput> = {},
  ): ListHighlightsInput {
    return { actorUserId: MEMBER_ID, clubId: CLUB_ID, ...overrides };
  }

  function aClubHighlight(overrides: Partial<Highlight> = {}): Highlight {
    return aHighlight({
      clubId: CLUB_ID,
      bookId: BOOK_ID,
      userId: MEMBER_ID,
      color: YELLOW,
      page: PAGE,
      ...overrides,
    });
  }

  function ids(found: readonly Highlight[]): string[] {
    return found.map((highlight) => highlight.id);
  }

  describe('permission and tenant', () => {
    // Regra 1 — 404 na borda, não 403: não confirmamos a existência do clube.
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 1 — sair do clube arquiva o membership, e quem saiu não lê mais o
    // acervo (→ ADR 0002, "sair arquiva o Membership").
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

    // Regra 1 — um clube em que a pessoa não entrou é 404, exista ele ou não.
    it('rejects a club the actor is not a member of', async () => {
      await expect(
        useCase.execute(validInput({ clubId: 'club-3' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    /**
     * ⚠️ Regra 1 — **o corte vem ANTES da consulta.**
     *
     * Sem o contador, "recusou antes de consultar" e "consultou e depois
     * recusou" dão o mesmo erro para o cliente — e a segunda ordem é a que
     * transforma um endpoint de leitura em oráculo de existência (e em custo de
     * banco) para quem não é do clube. → §7.3.
     */
    it('never queries the repository when the actor is not a member', async () => {
      await highlights.save(aClubHighlight({ id: 'highlight-1' }));

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(highlights.findCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 1, **o lado POSITIVO do contador** — e ele não é decoração: um
     * contador só afirmado como `toBe(0)` é meio contador, porque um incremento
     * que alguém apague deixa todo `toBe(0)` passar por acidente, e aí ele é a
     * asserção vazia do §7.4.
     */
    it('queries the repository exactly once on the happy path', async () => {
      await highlights.save(aClubHighlight({ id: 'highlight-1' }));

      const found = await useCase.execute(validInput());

      expect(highlights.findCalls).toBe(1);
      expect(ids(found)).toEqual(['highlight-1']);
    });

    /**
     * Regra 2 — **leitura não exige papel**: o acervo é do grupo. É o ADR 0002 —
     * o filtro `Tudo · Minhas · de X` é navegação, não permissão, e um `MEMBER`
     * que não lesse o que o clube grifou quebraria o incentivo mútuo.
     *
     * Asserta **a saída real**, nunca "não lançou": um
     * `resolves.not.toBeInstanceOf(...)` sobre `Highlight[]` não assertaria nada
     * (§7.4), e com o UseCase mutilado para `return []` continuaria verde.
     */
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])(
      'gives the %s the highlights of the whole club',
      async (_label, actorUserId) => {
        await highlights.save(
          aClubHighlight({ id: 'highlight-do-clube', userId: OTHER_MEMBER_ID }),
        );

        const found = await useCase.execute(validInput({ actorUserId }));

        expect(ids(found)).toEqual(['highlight-do-clube']);
      },
    );

    /**
     * Regra 2 + ADR 0002 — o grifo de OUTRA pessoa aparece, e aparece desde o
     * instante em que foi salvo. Dentro do clube não existe grifo privado.
     */
    it('returns the highlights of the other members, not only the actor own', async () => {
      await highlights.save(
        aClubHighlight({ id: 'highlight-deles', userId: OTHER_MEMBER_ID }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['highlight-deles']);
    });
  });

  describe('tenant cut', () => {
    /**
     * Regra 3 — o `clubId` entra em **AND** com todo filtro. O grifo gêmeo do
     * outro clube casa TODOS os outros filtros de propósito: é o que faz este
     * teste falhar se o corte de tenant deixar de ser aplicado, ou se algum
     * filtro passar a substituí-lo em vez de somar-se a ele.
     */
    it('never returns a highlight of another club, even when every other filter matches', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'highlight-de-outro-clube',
          clubId: OTHER_CLUB_ID,
        }),
      );
      await highlights.save(aClubHighlight({ id: 'highlight-deste-clube' }));

      const found = await useCase.execute(
        validInput({
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          color: YELLOW,
          page: PAGE,
        }),
      );

      expect(ids(found)).toEqual(['highlight-deste-clube']);
    });

    // Regra 3 — e o `authorId` não abre um caminho para ler outro clube: a
    // pessoa é membro dos dois, e o `clubId` do input é o que decide.
    it('never crosses clubs through authorId, even for a legitimate actor', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'highlight-de-outro-clube',
          clubId: OTHER_CLUB_ID,
        }),
      );
      await highlights.save(aClubHighlight({ id: 'highlight-deste-clube' }));

      const found = await useCase.execute(validInput({ authorId: MEMBER_ID }));

      expect(ids(found)).toEqual(['highlight-deste-clube']);
    });

    /**
     * Regra 4 — livro de outro clube dá lista **VAZIA**, não 404: o corte é o
     * `clubId`, e o `bookId` é filtro. É o precedente do `listNotes` (decisão da
     * Tarefa 10) — um 404 aqui só diria "esse livro existe em outro lugar".
     */
    it('returns an empty list for a book of another club, instead of raising', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'highlight-de-outro-clube',
          clubId: OTHER_CLUB_ID,
          bookId: OTHER_BOOK_ID,
        }),
      );

      await expect(
        useCase.execute(validInput({ bookId: OTHER_BOOK_ID })),
      ).resolves.toEqual([]);
    });
  });

  describe('archived highlights', () => {
    // Arquivado é invisível até o MVP 4, **inclusive para o autor** — não há
    // tela de arquivados, e não há flag para pedi-los (`includeArchived` seria
    // flag sem chamador).
    it('never returns an archived highlight', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'highlight-arquivado',
          status: 'ARCHIVED',
          archivedAt: ARCHIVED_AT,
        }),
      );
      await highlights.save(aClubHighlight({ id: 'highlight-ativo' }));

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['highlight-ativo']);
    });

    // E nem para o próprio autor: pedir `authorId` dele não ressuscita o que ele
    // arquivou.
    it('hides an archived highlight even from its own author', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'highlight-arquivado',
          userId: MEMBER_ID,
          status: 'ARCHIVED',
          archivedAt: ARCHIVED_AT,
        }),
      );

      await expect(
        useCase.execute(validInput({ authorId: MEMBER_ID })),
      ).resolves.toEqual([]);
    });

    /**
     * ⚠️ Regra 10 — **o mecanismo**: o UseCase manda `status: 'ACTIVE'` **no
     * filtro**, e o corte é do REPOSITÓRIO.
     *
     * Sem esta asserção, os dois testes de cima passariam com um UseCase que
     * carregasse o acervo inteiro e filtrasse em memória depois — que é o mesmo
     * bug com uma fatura de banco maior. Num cenário sem grifo arquivado, os
     * dois devolvem exatamente o mesmo array: quem separa é o `findFilters`,
     * nunca o resultado (§7.3).
     */
    it('asks the repository for the ACTIVE ones, instead of filtering afterwards', async () => {
      await useCase.execute(validInput());

      expect(highlights.findFilters).toStrictEqual([
        { clubId: CLUB_ID, status: 'ACTIVE' },
      ]);
    });
  });

  describe('order', () => {
    /**
     * ⚠️ Regras 12 e 13 — **`createdAt` decrescente, e a ordem é do UseCase.**
     *
     * O fake enumera na ordem INVERSA à de inserção (§7.2, a armadilha
     * deliberada), então um `listHighlights` sem `sort` devolveria
     * `[antigo, novo, meio]` e este teste **falha**. Medido por mutação: sem o
     * `sort`, **4** testes deste arquivo acusam (e eram 3 antes de o fixture do
     * teste do `updatedAt`, dois blocos abaixo, ser corrigido).
     *
     * A precondição é **pinada** porque o §7.2 registra duas histórias em que o
     * fixture escolhido fez a ordem errada coincidir com a certa: aqui a ordem
     * alfabética dos ids é `OLDEST < NEWEST < MIDDLE`, que não é a esperada nem
     * a inversa dela — então um `sort` por `id` também falha, nos dois sentidos.
     * Sem o pino, um id renomeado devolveria a coincidência em silêncio.
     */
    it('orders by createdAt descending, against a repository that enumerates reversed', async () => {
      // Precondição 1: a ordem alfabética dos ids não é a esperada nem a
      // inversa dela.
      expect(ID_OLDEST < ID_NEWEST).toBe(true);
      expect(ID_NEWEST < ID_MIDDLE).toBe(true);

      await highlights.save(
        aClubHighlight({ id: ID_MIDDLE, createdAt: MIDDLE_AT }),
      );
      await highlights.save(
        aClubHighlight({ id: ID_NEWEST, createdAt: NEWEST_AT }),
      );
      await highlights.save(
        aClubHighlight({ id: ID_OLDEST, createdAt: OLDEST_AT }),
      );

      // Precondição 2: nem a ordem do repositório, nem a de inserção coincidem
      // com a esperada.
      expect(ids(await highlights.find({ clubId: CLUB_ID }))).toEqual([
        ID_OLDEST,
        ID_NEWEST,
        ID_MIDDLE,
      ]);

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual([ID_NEWEST, ID_MIDDLE, ID_OLDEST]);
    });

    /**
     * ⚠️ Regra 12 — o desempate por `id`, que é o que torna a ordem
     * DETERMINÍSTICA. Duas pessoas grifando no mesmo instante é o caso normal de
     * um clube, e aí a ordem não pode depender de como o repositório enumerou.
     *
     * A inserção é `TIE_FIRST` e depois `TIE_SECOND`: o fake devolve
     * `[SECOND, FIRST]`, então um `sort` estável **sem** desempate manteria
     * `SECOND` na frente e este teste falharia. A precondição do id é pinada
     * pelo mesmo motivo de cima.
     */
    it('breaks a createdAt tie by id, so the order never depends on the repository', async () => {
      expect(TIE_FIRST < TIE_SECOND).toBe(true);

      const createdAt = MIDDLE_AT;
      await highlights.save(aClubHighlight({ id: TIE_FIRST, createdAt }));
      await highlights.save(aClubHighlight({ id: TIE_SECOND, createdAt }));

      expect(ids(await highlights.find({ clubId: CLUB_ID }))).toEqual([
        TIE_SECOND,
        TIE_FIRST,
      ]);

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual([TIE_FIRST, TIE_SECOND]);
    });

    /**
     * `createdAt` e **não** `updatedAt`: o comentário do grifo é reescrito a cada
     * autosave, e por `updatedAt` a lista pularia embaixo do dedo de quem está
     * digitando. É a mesma decisão do `listNotes`.
     *
     * O grifo mais ANTIGO é o editado por último de propósito: é o que faz um
     * `sort` por `updatedAt` falhar aqui.
     *
     * ⚠️ E a inserção é o mais NOVO primeiro, também de propósito: com a ordem
     * inversa (que foi como este teste nasceu), a enumeração invertida do fake
     * **coincidia** com a esperada e um `listHighlights` sem `sort` nenhum
     * passava aqui. Medido por mutação: era 3 acusadores, e com o fixture
     * corrigido são 4. É a história do §7.2 acontecendo de novo — o teste tinha
     * o nome certo e não provava o que o nome diz.
     */
    it('orders by createdAt and not by updatedAt, so editing a comment never reshuffles the list', async () => {
      await highlights.save(
        aClubHighlight({
          id: 'grifo-novo-nunca-editado',
          createdAt: NEWEST_AT,
          updatedAt: NEWEST_AT,
        }),
      );
      await highlights.save(
        aClubHighlight({
          id: 'grifo-antigo-editado-agora',
          createdAt: OLDEST_AT,
          updatedAt: EDITED_AT,
        }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual([
        'grifo-novo-nunca-editado',
        'grifo-antigo-editado-agora',
      ]);
    });

    /**
     * A ordenação é sobre uma **cópia**: o array é do repositório, e mutá-lo é
     * smell de fronteira — vira hábito e um dia o repositório o guarda em cache.
     *
     * (Não está entre as 16 regras da spec; entra porque é a propriedade que o
     * `listNotes` tem no mesmo lugar, e sem teste ela é a primeira a cair num
     * refactor de uma linha. Medido: 1 acusador no mutante `[...found].sort` →
     * `found.sort`.)
     *
     * ⚠️ **E este teste não pina ordem nenhuma** — o assunto dele não é a ordem,
     * é a mutação (§7.2, o corolário). Ele compara o array do repositório com o
     * **snapshot** tirado no instante do retorno: "continua como saiu", qualquer
     * que fosse a ordem em que saiu. A precondição também é derivada, não
     * escrita à mão: a ordenada tem de ser DIFERENTE da que saiu, senão "não
     * mutou" seria vácuo (com as duas iguais, um `sort` in loco não deixaria
     * rastro).
     */
    it('sorts a copy, never the array the repository returned', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-novo', createdAt: NEWEST_AT }),
      );
      await highlights.save(
        aClubHighlight({ id: 'grifo-antigo', createdAt: OLDEST_AT }),
      );

      const found = await useCase.execute(validInput());

      expect(highlights.arraysReturnedByFind).toHaveLength(1);
      const repositoryArray = required(highlights.arraysReturnedByFind[0]);
      const snapshotAtReturn = required(highlights.snapshotsAtReturn[0]);

      // Precondição derivada: a saída ordenada difere da que o repositório deu.
      expect(ids(found)).not.toEqual(ids(snapshotAtReturn));
      // E o array do repositório continua exatamente como estava quando saiu.
      expect(ids(repositoryArray)).toEqual(ids(snapshotAtReturn));
    });
  });

  describe('filters', () => {
    /**
     * Regra 5 — sem filtro nenhum além do `clubId`, vem o acervo de grifos do
     * clube inteiro: de todo mundo, de todo livro, de toda cor, de toda página.
     *
     * ⚠️ Regra 14 (o corolário do §7.2) — **o assunto aqui não é a ordem**, então
     * este teste não depende dela: `arrayContaining` + `toHaveLength`. Pinar a
     * ordem aqui faria o teste quebrar por um motivo que não tem nada a ver com
     * o nome dele no dia em que a ordem virar outro critério legítimo — e quem
     * lesse o vermelho procuraria o bug no lugar errado.
     */
    it('returns the whole collection of the club when no filter is given', async () => {
      await highlights.save(
        aClubHighlight({ id: 'meu-amarelo-p45', color: YELLOW, page: PAGE }),
      );
      await highlights.save(
        aClubHighlight({
          id: 'dele-verde-sem-pagina',
          userId: OTHER_MEMBER_ID,
          color: GREEN,
          page: null,
        }),
      );
      await highlights.save(
        aClubHighlight({ id: 'outro-livro', bookId: OTHER_BOOK_ID }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(
        expect.arrayContaining([
          'meu-amarelo-p45',
          'dele-verde-sem-pagina',
          'outro-livro',
        ]),
      );
      expect(found).toHaveLength(3);
    });

    it('returns an empty list for a club with no highlights', async () => {
      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });

    /**
     * Regra 6 — o `authorId` recorta por autor, e é **navegação, não permissão**:
     * o membro recebe o grifo de qualquer pessoa do clube pedindo o `authorId`
     * dela. → ADR 0002.
     *
     * O ator aqui é o `MEMBER` e o autor pedido é **outra pessoa**: é o caso que
     * uma implementação com cheiro de privacidade (devolver só o do próprio
     * ator) reprovaria.
     */
    it('gives the actor the highlights of another member when asked for that author', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-deles', userId: OTHER_MEMBER_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'grifo-meu', userId: MEMBER_ID }),
      );

      const found = await useCase.execute(
        validInput({ authorId: OTHER_MEMBER_ID }),
      );

      expect(ids(found)).toEqual(['grifo-deles']);
    });

    // Regra 6 — e o outro sentido ("Minhas"), senão um `find` que ignorasse o
    // `authorId` passaria no de cima quando só houvesse um autor.
    it('returns only the highlights of the author asked for', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-deles', userId: OTHER_MEMBER_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'grifo-meu', userId: MEMBER_ID }),
      );

      const found = await useCase.execute(validInput({ authorId: MEMBER_ID }));

      expect(ids(found)).toEqual(['grifo-meu']);
    });

    it('returns an empty list for an author who highlighted nothing', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-deles', userId: OTHER_MEMBER_ID }),
      );

      await expect(
        useCase.execute(validInput({ authorId: MEMBER_ID })),
      ).resolves.toEqual([]);
    });

    // Regra 7 — a cor recorta pela cor EXATA: pedir `#facc15` não traz
    // `#22c55e`. Nos dois sentidos, senão um UseCase que ignorasse a cor
    // passaria na metade dos casos.
    it.each([
      [YELLOW, 'amarelo'],
      [GREEN, 'verde'],
    ] as const)('returns only the %s highlights', async (color, expected) => {
      await highlights.save(aClubHighlight({ id: 'amarelo', color: YELLOW }));
      await highlights.save(aClubHighlight({ id: 'verde', color: GREEN }));

      const found = await useCase.execute(validInput({ color }));

      expect(ids(found)).toEqual([expected]);
    });

    // Regra 7 — e uma cor da paleta que ninguém usou dá vazio, não o acervo
    // inteiro.
    it('returns an empty list for a colour of the palette nobody used', async () => {
      await highlights.save(aClubHighlight({ id: 'amarelo', color: YELLOW }));

      await expect(
        useCase.execute(validInput({ color: GREEN })),
      ).resolves.toEqual([]);
    });

    // Igualdade exata, não faixa (decisão C): a faixa é aditiva e ninguém pediu.
    it('returns only the highlights of the page asked for', async () => {
      await highlights.save(
        aClubHighlight({ id: 'pagina-46', page: OTHER_PAGE }),
      );
      await highlights.save(aClubHighlight({ id: 'pagina-45', page: PAGE }));

      const found = await useCase.execute(validInput({ page: PAGE }));

      expect(ids(found)).toEqual(['pagina-45']);
    });

    /**
     * ⚠️ Regra 8 — **`page` contra coluna NULA.** `page: 45` **não** casa um
     * grifo sem página.
     *
     * É a fidelidade do §7.1 (a 4ª aparição da classe) vista de cima do
     * UseCase: no Postgres `WHERE "page" = 45` contra `NULL` é **falso**, e um
     * fake que casasse `null` faria o grifo sem página aparecer no filtro de uma
     * página que não é a dele. `page` é o único campo filtrável anulável — grifo
     * sem página é caso legítimo (`Highlight.page` é anulável de propósito).
     *
     * O teste do fake é o irmão deste, e os dois existem: **fidelidade afirmada
     * em comentário e não em teste é fidelidade que o próximo refactor apaga.**
     */
    it('never returns a highlight with no page when the filter asks for a page', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-sem-pagina', page: null }),
      );
      await highlights.save(
        aClubHighlight({ id: 'grifo-da-pagina-45', page: PAGE }),
      );

      const found = await useCase.execute(validInput({ page: PAGE }));

      expect(ids(found)).toEqual(['grifo-da-pagina-45']);
    });

    // Regra 8, o outro lado: sem filtro de página o grifo sem página aparece —
    // ele é do acervo do clube como qualquer outro.
    it('returns a highlight with no page when no page is asked for', async () => {
      await highlights.save(
        aClubHighlight({ id: 'grifo-sem-pagina', page: null }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['grifo-sem-pagina']);
    });

    /**
     * Regra 9 — dois ou mais filtros juntos são **AND, não OR**. Cada grifo
     * abaixo erra em UM filtro só, então cada filtro que deixasse de ir traria
     * um grifo a mais, e um OR traria todos.
     */
    it('combines the filters with AND, never OR', async () => {
      await highlights.save(
        aClubHighlight({ id: 'wrong-club', clubId: OTHER_CLUB_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-book', bookId: OTHER_BOOK_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-author', userId: OTHER_MEMBER_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-colour', color: GREEN }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-page', page: OTHER_PAGE }),
      );
      await highlights.save(aClubHighlight({ id: 'the-one' }));

      const found = await useCase.execute(
        validInput({
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          color: YELLOW,
          page: PAGE,
        }),
      );

      expect(ids(found)).toEqual(['the-one']);
    });

    // Regra 9 — o `bookId` isolado, que é o corte da estante e o filtro que a
    // tela da Tarefa 25 usa sempre.
    it('returns only the highlights of the book asked for', async () => {
      await highlights.save(
        aClubHighlight({ id: 'outro-livro', bookId: OTHER_BOOK_ID }),
      );
      await highlights.save(aClubHighlight({ id: 'este-livro' }));

      const found = await useCase.execute(validInput({ bookId: BOOK_ID }));

      expect(ids(found)).toEqual(['este-livro']);
    });

    /**
     * ⚠️ Regra 11 — **UM `find`, UM filtro, e sem chave à toa.**
     *
     * Uma consulta por filtro seria N idas ao banco por request (decisão E), e
     * uma interseção em memória carregaria o acervo inteiro para descartá-lo.
     * Quem prova isso é o `findFilters`, não o resultado: os dois desenhos
     * devolvem o mesmo array.
     *
     * O `toStrictEqual` é o que pega a **chave à toa** — um
     * `color: undefined` declarado no objeto do filtro passaria num `toEqual`.
     */
    it('passes every filter to the repository in a single HighlightFilter', async () => {
      await useCase.execute(
        validInput({
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          color: YELLOW,
          page: PAGE,
        }),
      );

      expect(highlights.findCalls).toBe(1);
      expect(highlights.findFilters).toStrictEqual([
        {
          clubId: CLUB_ID,
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          color: YELLOW,
          page: PAGE,
          status: 'ACTIVE',
        },
      ]);
    });

    /**
     * ⚠️ Regra 11 — e o filtro omitido **não aparece como chave `undefined`**.
     *
     * No Prisma `{ page: undefined }` é ignorado, então o resultado não muda —
     * mas o `HighlightFilter` é o contrato, e uma chave presente com valor
     * `undefined` é a diferença entre "não filtra" e "filtra por nada" para
     * qualquer implementação futura que itere as chaves do filtro.
     */
    it('leaves the filters the caller omitted out of the HighlightFilter entirely', async () => {
      await useCase.execute(validInput({ color: YELLOW }));

      expect(highlights.findFilters).toStrictEqual([
        { clubId: CLUB_ID, color: YELLOW, status: 'ACTIVE' },
      ]);
    });
  });

  /**
   * Estado acidental entre chamadas seria bug de produção invisível: a Tarefa 24
   * compõe o UseCase uma vez e reusa por request. Aqui o vazamento mais
   * perigoso é o acervo de um clube aparecendo no outro.
   */
  it('does not leak state between two executes of the same instance', async () => {
    await highlights.save(aClubHighlight({ id: 'grifo-deste-clube' }));
    await highlights.save(
      aClubHighlight({ id: 'grifo-do-outro-clube', clubId: OTHER_CLUB_ID }),
    );

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(
      validInput({ clubId: OTHER_CLUB_ID, color: YELLOW }),
    );
    const third = await useCase.execute(validInput());

    expect(ids(first)).toEqual(['grifo-deste-clube']);
    expect(ids(second)).toEqual(['grifo-do-outro-clube']);
    // A terceira chamada repete a primeira: um filtro que tivesse ficado
    // "grudado" na instância mudaria o resultado dela.
    expect(ids(third)).toEqual(['grifo-deste-clube']);
  });
});
