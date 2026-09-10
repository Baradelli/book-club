import { beforeEach, describe, expect, it } from 'vitest';

import type { GeneralStatus, MemberRole } from '../../domain/club';
import { NotAMemberError } from '../../domain/errors';
import { aMembership, aUser, required } from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { UserRepositoryFake } from '../_fakes/user-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListClubMembersInput } from '../list-club-members';
import { ListClubMembers } from '../list-club-members';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const ACTOR_ID = 'user-actor';

describe('ListClubMembers', () => {
  let memberships: MembershipRepositoryFake;
  let users: UserRepositoryFake;
  let useCase: ListClubMembers;

  beforeEach(() => {
    memberships = new MembershipRepositoryFake();
    users = new UserRepositoryFake();
    useCase = new ListClubMembers(
      new AssertMembership(memberships),
      memberships,
      users,
    );
  });

  // Fixture como FACTORY, nunca `const` de describe (§7.7). Nada é semeado no
  // `beforeEach`: o ator APARECE na própria lista (ele é membro do clube), e um
  // membro escondido no setup mudaria a ordem esperada de todo teste.
  async function seedMember(member: {
    userId: string;
    name?: string | null;
    clubId?: string;
    role?: MemberRole;
    status?: GeneralStatus;
  }): Promise<void> {
    const {
      userId,
      name = 'Maria',
      clubId = CLUB_ID,
      role = 'MEMBER',
      status = 'ACTIVE',
    } = member;

    // A mesma pessoa pode estar em dois clubes; o `User` é um só.
    if ((await users.byId(userId)) === null) {
      await users.save(
        aUser({ id: userId, name, email: `${userId}@exemplo.com` }),
      );
    }
    await memberships.save(aMembership({ userId, clubId, role, status }));
  }

  function validInput(
    overrides: Partial<ListClubMembersInput> = {},
  ): ListClubMembersInput {
    return { actorUserId: ACTOR_ID, clubId: CLUB_ID, ...overrides };
  }

  describe('permission and tenant', () => {
    // Regra 1, o lado NEGATIVO: o corte roda ANTES de qualquer leitura. Sem o
    // `findByClubCalls`, "recusou antes de ler" e "leu e depois recusou" dão o
    // mesmo erro ao cliente — e a segunda ordem trafega os nomes de um clube
    // para quem não é dele antes de descartá-los (§7.3).
    it('refuses an actor with no membership without reading a single membership', async () => {
      await seedMember({ userId: 'user-de-dentro', name: 'Ana' });

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-de-fora' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
      expect(memberships.findByClubCalls).toBe(0);
    });

    // Regra 1, o lado POSITIVO: sem ele, um incremento que alguém apague deixa
    // todo `toBe(0)` acima passar por acidente (§7.3).
    it('reads the memberships of the club exactly once on the happy path', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana' });

      await useCase.execute(validInput());

      expect(memberships.findByClubCalls).toBe(1);
    });

    /*
      Regra 2: a leitura NÃO exige papel — é atribuição, não administração
      (ADR 0002). E asserta a SAÍDA REAL, nunca "não lançou" (§7.4).

      ⚠️ `arrayContaining` + `toHaveLength` e NÃO `toEqual` posicional: o assunto
      deste teste é o PAPEL, não a ordem. A ordem tem dois testes dedicados, e é
      só lá que ela se pina — senão, no dia em que a armadilha do fake virar
      outro critério legítimo, este teste quebra por um motivo que não tem nada
      a ver com o nome dele e quem lê o vermelho procura o bug no lugar errado
      (§7.2, o corolário).
    */
    it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
      'gives the %s the members of the club, with their names',
      async (role) => {
        await seedMember({ userId: ACTOR_ID, name: 'Ana', role });
        await seedMember({ userId: 'user-bruno', name: 'Bruno' });

        const found = await useCase.execute(validInput());

        expect(found).toHaveLength(2);
        expect(found).toEqual(
          expect.arrayContaining([
            { userId: ACTOR_ID, name: 'Ana', role, status: 'ACTIVE' },
            {
              userId: 'user-bruno',
              name: 'Bruno',
              role: 'MEMBER',
              status: 'ACTIVE',
            },
          ]),
        );
      },
    );

    // Regra 3: a barreira entre dois clubes. O ator está nos DOIS, o que é
    // exatamente o caso em que um `findByClub` sem `clubId` passaria verde num
    // fixture ingênuo.
    it('never includes a membership of another club, not even of a user who is in both', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana' });
      await seedMember({
        userId: ACTOR_ID,
        name: 'Ana',
        clubId: OTHER_CLUB_ID,
      });
      await seedMember({
        userId: 'user-vizinho',
        name: 'Bruno',
        clubId: OTHER_CLUB_ID,
      });

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { userId: ACTOR_ID, name: 'Ana', role: 'MEMBER', status: 'ACTIVE' },
      ]);
    });

    // Regra 4: o corte da Tarefa 01, e ele não muda — quem SAIU do clube não lê
    // mais nada dele, mesmo continuando a ter nome no acervo (ADR 0002). São as
    // duas metades da decisão A: a pessoa aparece na lista dos outros e não vê
    // mais a lista.
    it('refuses an actor whose own membership is archived', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana', status: 'ARCHIVED' });
      await seedMember({ userId: 'user-de-dentro', name: 'Bruno' });

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(memberships.findByClubCalls).toBe(0);
    });
  });

  describe('what the list returns', () => {
    // Regra 5 e a razão de existir da fatia: sem esta linha, a anotação de quem
    // saiu do clube volta a ser "Alguém do clube". → ADR 0002, decisão A.
    it('returns the member who left the club, ARCHIVED and with the name', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana' });
      await seedMember({
        userId: 'user-saiu',
        name: 'Bruno',
        status: 'ARCHIVED',
      });

      const found = await useCase.execute(validInput());

      // A ordem não é o assunto aqui: o que importa é que quem saiu VEIO, com
      // o status certo e com o nome. → §7.2, o corolário.
      expect(found).toHaveLength(2);
      expect(found).toEqual(
        expect.arrayContaining([
          { userId: ACTOR_ID, name: 'Ana', role: 'MEMBER', status: 'ACTIVE' },
          {
            userId: 'user-saiu',
            name: 'Bruno',
            role: 'MEMBER',
            status: 'ARCHIVED',
          },
        ]),
      );
    });

    // Regra 6: `User.name` é `String?` e o aceite de convite não exige nome.
    // Um `?? 'Alguém'` aqui seria texto de interface no servidor — proibido
    // pelo CLAUDE.md, e em inglês ou português? Quem decide é o `t()` da tela.
    it('lets a null name through, with no fallback', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana' });
      await seedMember({ userId: 'user-sem-nome', name: null });

      const found = await useCase.execute(validInput());

      // Idem: o assunto é o `null` atravessar, não onde ele cai na lista — que
      // é o que o `puts the member with no name last` prova. → §7.2.
      expect(found).toHaveLength(2);
      expect(found).toEqual(
        expect.arrayContaining([
          { userId: ACTOR_ID, name: 'Ana', role: 'MEMBER', status: 'ACTIVE' },
          {
            userId: 'user-sem-nome',
            name: null,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ]),
      );
    });

    /*
      Regra 7, a metade do DOMÍNIO.

      O UseCase monta o objeto campo a campo em vez de espalhar o `User`, e é
      isto que se mede: o fixture tem `email`, `passwordHash` e `isSuperAdmin`,
      e um `{ ...user, role, status }` os traria todos. A outra metade — que o
      SERIALIZER corta o que não está declarado — é do `response` schema, e se
      prova no teste de schema em `shared` e na rota (§6.1).
    */
    it('carries exactly userId, name, role and status — no email, no passwordHash, no isSuperAdmin', async () => {
      await users.save(
        aUser({
          id: ACTOR_ID,
          name: 'Ana',
          email: 'ana@exemplo.com',
          passwordHash: 'hash-secreto',
          isSuperAdmin: true,
        }),
      );
      await memberships.save(
        aMembership({ userId: ACTOR_ID, clubId: CLUB_ID }),
      );

      const found = await useCase.execute(validInput());

      expect(Object.keys(required(found[0])).sort()).toEqual([
        'name',
        'role',
        'status',
        'userId',
      ]);
    });

    // O ator APARECE na própria lista: ele é membro do clube, e a tela precisa
    // do nome dele para atribuir as anotações dele.
    it('includes the actor themselves when they are the only member', async () => {
      await seedMember({ userId: ACTOR_ID, name: 'Ana' });

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { userId: ACTOR_ID, name: 'Ana', role: 'MEMBER', status: 'ACTIVE' },
      ]);
    });
  });

  /*
    Regra 9 — a ordem, e o fixture é escolhido para a implementação ERRADA
    FALHAR (§7.2 e §7.8).

    Cinco pessoas, e a ordem esperada difere de TODAS as candidatas erradas:
    a de inserção, a inversa (que é a que o fake devolve), a por `userId`, a com
    os nulos na frente, a sem desempate e a que usa `localeCompare`. As
    precondições são PINADAS, senão um id ou um nome renomeado devolve a
    coincidência em silêncio — foi o que aconteceu na Tarefa 16.
  */
  describe('order', () => {
    const ANA_B_ID = 'user-b';
    const ANA_D_ID = 'user-d';
    const BRUNO_ID = 'user-a';
    const ANA_MARIA_ID = 'user-e';
    const NO_NAME_ID = 'user-c';

    /*
      ⚠️ Os NOMES são constantes, e não literais repetidos no `seedMember` e nas
      precondições.

      A primeira versão deste arquivo pinava `'Bruno' < 'ana maria'` sobre
      literais enquanto o fixture semeava os seus próprios: **medido na rodada
      de correção da 26a**, trocar `'ana maria'` por `'Zilda'` no fixture
      deixava a precondição VERDE e o mutante `localeCompare` sobrevivia a
      1286/1286. É a Tarefa 16 outra vez, consertada só na metade — os ids
      estavam pinados, os nomes não.

      Uma fonte só para cada valor: quem renomear um nome aqui vê a precondição
      falhar, que é o ponto de existir uma precondição.
    */
    const ANA_NAME = 'Ana';
    const BRUNO_NAME = 'Bruno';
    // Minúscula de propósito: 'B' (66) precede 'a' (97) por code point, e o
    // `localeCompare('pt')` DISCORDA. É este par que separa as duas
    // implementações da decisão E.
    const ANA_MARIA_NAME = 'ana maria';

    const EXPECTED_IDS = [
      ANA_B_ID,
      ANA_D_ID,
      BRUNO_ID,
      ANA_MARIA_ID,
      NO_NAME_ID,
    ];
    const EXPECTED_NAMES = [
      ANA_NAME,
      ANA_NAME,
      BRUNO_NAME,
      ANA_MARIA_NAME,
      null,
    ];

    beforeEach(async () => {
      // A ordem de INSERÇÃO é [b, a, c, d, e] — nem ela nem a inversa é a
      // esperada, e as asserções abaixo pinam isso.
      await seedMember({ userId: ANA_B_ID, name: ANA_NAME });
      await seedMember({ userId: BRUNO_ID, name: BRUNO_NAME });
      await seedMember({ userId: NO_NAME_ID, name: null });
      await seedMember({ userId: ANA_D_ID, name: ANA_NAME });
      await seedMember({ userId: ANA_MARIA_ID, name: ANA_MARIA_NAME });
    });

    it('pins the preconditions that make this fixture discriminate', async () => {
      // Desempate: `user-b` antes de `user-d`.
      expect(ANA_B_ID < ANA_D_ID).toBe(true);

      // Homônimas de verdade, senão não há empate para desempatar.
      expect(EXPECTED_NAMES[0]).toBe(EXPECTED_NAMES[1]);

      // Comparação por CODE POINT: 'B' (66) vem antes de 'a' (97), então
      // BRUNO_NAME < ANA_MARIA_NAME...
      expect(BRUNO_NAME < ANA_MARIA_NAME).toBe(true);
      // ...e o `localeCompare` DISCORDA, que é o que faz este fixture separar
      // as duas implementações (decisão E). Sem esta divergência o mutante
      // `localeCompare` não tem acusador — foi medido.
      expect(ANA_MARIA_NAME.localeCompare(BRUNO_NAME, 'pt')).toBeLessThan(0);

      // A ordem do repositório não é a esperada — nem ela, nem a inversa
      // (a de inserção), nem a ordem por `userId`.
      const enumerated = (await memberships.findByClub(CLUB_ID)).map(
        (m) => m.userId,
      );
      expect(enumerated).not.toEqual(EXPECTED_IDS);
      expect([...enumerated].reverse()).not.toEqual(EXPECTED_IDS);
      expect([...EXPECTED_IDS].sort()).not.toEqual(EXPECTED_IDS);
    });

    it('sorts by name ascending, nulls last, ties broken by userId', async () => {
      const found = await useCase.execute(
        validInput({ actorUserId: BRUNO_ID }),
      );

      expect(found.map((member) => member.userId)).toEqual(EXPECTED_IDS);
      expect(found.map((member) => member.name)).toEqual(EXPECTED_NAMES);
    });

    // O nulo no FIM e não na frente: a implementação que devolve
    // `a.name < b.name` cru sobre `null` (ou que troca os sinais) põe o sem
    // nome em outro lugar, e este teste é o que a acusa.
    it('puts the member with no name last, not first', async () => {
      const found = await useCase.execute(
        validInput({ actorUserId: BRUNO_ID }),
      );

      expect(required(found[found.length - 1]).userId).toBe(NO_NAME_ID);
      expect(required(found[0]).userId).not.toBe(NO_NAME_ID);
    });
  });
});
