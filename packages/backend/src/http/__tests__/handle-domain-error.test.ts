import { describe, expect, it } from 'vitest';

import * as domainErrors from '../../domain/errors';
import {
  BookNotFoundError,
  ClubNotFoundError,
  DuplicateMembershipError,
  EmailAlreadyInUseError,
  ForbiddenRoleError,
  InvalidBookError,
  InvalidClubError,
  InvalidCredentialsError,
  InvalidInviteError,
  InvalidNoteError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  NotAMemberError,
  NoteNotFoundError,
  NotSuperAdminError,
  NotTheAuthorError,
  PlanItemNotFoundError,
  SessionUserNotFoundError,
  WeakPasswordError,
} from '../../domain/errors';
import { handleDomainError } from '../handle-domain-error';

interface Sent {
  statusCode: number;
  payload: { error: string };
}

/** Reply mínimo: registra o que a borda enviaria. */
function replySpy() {
  const sent: Sent[] = [];
  return {
    sent,
    status(statusCode: number) {
      return {
        send(payload: { error: string }) {
          sent.push({ statusCode, payload });
          return payload;
        },
      };
    },
  };
}

describe('handleDomainError', () => {
  // Uma linha por linha do mapa (20). A mensagem esperada faz parte do
  // contrato: só o 400 publica o texto do domínio.
  it.each([
    [400, new InvalidBookError('detalhe-a0'), 'detalhe-a0'],
    [404, new BookNotFoundError('detalhe-a1'), 'Not found'],
    [400, new InvalidNoteError('detalhe-a2'), 'detalhe-a2'],
    [404, new PlanItemNotFoundError('detalhe-a3'), 'Not found'],
    [404, new NoteNotFoundError('detalhe-a4'), 'Not found'],
    [403, new NotTheAuthorError('detalhe-a5'), 'Forbidden'],
    [400, new InvalidClubError('detalhe-a'), 'detalhe-a'],
    [400, new InvalidInviteError('detalhe-b'), 'detalhe-b'],
    [400, new WeakPasswordError('detalhe-c'), 'detalhe-c'],
    [401, new InvalidCredentialsError('detalhe-d'), 'Unauthorized'],
    [401, new SessionUserNotFoundError('detalhe-d2'), 'Unauthorized'],
    [403, new ForbiddenRoleError('detalhe-e'), 'Forbidden'],
    [403, new NotSuperAdminError('detalhe-f'), 'Forbidden'],
    [404, new ClubNotFoundError('detalhe-g'), 'Not found'],
    [404, new NotAMemberError('detalhe-h'), 'Not found'],
    [404, new InviteNotFoundError('detalhe-i'), 'Not found'],
    [409, new DuplicateMembershipError('detalhe-j'), 'Conflict'],
    [409, new EmailAlreadyInUseError('detalhe-l'), 'Conflict'],
    // ⚠️ 410 e não 409: "já foi usado" e "venceu" são a mesma frase para quem
    // lê, e é o que deixa o 409 do aceite significar SÓ "você já está neste
    // clube" (ver o comentário no mapa).
    [410, new InviteAlreadyUsedError('detalhe-k'), 'Gone'],
    [410, new InviteExpiredError('detalhe-m'), 'Gone'],
  ])(
    'translates %s with the public message for %s',
    (status, error, message) => {
      const reply = replySpy();

      handleDomainError(error, reply);

      expect(reply.sent).toEqual([
        { statusCode: status, payload: { error: message } },
      ]);
    },
  );

  // O gate: nenhuma resposta fora do 400 carrega o texto do domínio.
  it('never leaks the domain message outside the 400 class', () => {
    const secret = 'email maria@exemplo.com ja esta em uso';
    const leaky = [
      new BookNotFoundError(secret),
      new PlanItemNotFoundError(secret),
      new NoteNotFoundError(secret),
      new NotTheAuthorError(secret),
      new InvalidCredentialsError(secret),
      new SessionUserNotFoundError(secret),
      new ForbiddenRoleError(secret),
      new NotSuperAdminError(secret),
      new ClubNotFoundError(secret),
      new NotAMemberError(secret),
      new InviteNotFoundError(secret),
      new DuplicateMembershipError(secret),
      new InviteAlreadyUsedError(secret),
      new EmailAlreadyInUseError(secret),
      new InviteExpiredError(secret),
    ];

    for (const error of leaky) {
      const reply = replySpy();
      handleDomainError(error, reply);
      expect(reply.sent[0]?.payload.error).not.toContain('maria@exemplo.com');
      expect(reply.sent[0]?.payload.error).not.toBe(secret);
    }
  });

  it('keeps the two conflicts of the invite acceptance on different statuses', () => {
    /*
      ⚠️ A PROPRIEDADE DE QUE A TELA DE ACEITE DEPENDE, e ela não é dedutível do
      `it.each` acima (que prova cada linha do mapa isolada, e passaria com as
      duas no mesmo status).

      O `AcceptInvite` lança DOIS erros de conflito, e o corpo não carrega
      discriminador nenhum (§6.2). Então o STATUS é o único sinal: se os dois
      voltarem a compartilhar um status, a tela volta a ter de escrever uma
      frase que serve para os dois — e a que ela escrevia marcava o campo de
      e-mail (com `aria-invalid` num valor válido, e sem `role="alert"`) por
      causa de um convite já usado.
    */
    const used = replySpy();
    const duplicate = replySpy();

    handleDomainError(new InviteAlreadyUsedError('usado'), used);
    handleDomainError(new DuplicateMembershipError('já é membro'), duplicate);

    expect(used.sent[0]?.statusCode).not.toBe(duplicate.sent[0]?.statusCode);
    // E os valores, pinados: o 410 é "este link não vale mais" (a mesma frase
    // do convite vencido) e o 409 é "você já está neste clube".
    expect(used.sent[0]?.statusCode).toBe(410);
    expect(duplicate.sent[0]?.statusCode).toBe(409);
  });

  // ...e o 400 continua legível, que é o ponto de ser 400.
  it('keeps the domain message on the 400 class', () => {
    const reply = replySpy();

    handleDomainError(
      new InvalidClubError('club name must not be empty'),
      reply,
    );

    expect(reply.sent[0]?.payload.error).toBe('club name must not be empty');
  });

  // Relance de propósito: 500 no log é melhor que 400 mentiroso.
  it('rethrows an error that is not in the map', () => {
    const reply = replySpy();
    const unknown = new Error('algo inesperado');

    expect(() => handleDomainError(unknown, reply)).toThrow(unknown);
    expect(reply.sent).toEqual([]);
  });

  it('rethrows a thrown value that is not an Error at all', () => {
    const reply = replySpy();

    expect(() => handleDomainError('uma string', reply)).toThrow();
    expect(reply.sent).toEqual([]);
  });

  // A exaustividade do mapa. Sem este bloco, todo erro de domínio novo nasce
  // virando 500 sem nenhum sinal — e faltam ~30 tarefas de UseCase. O teste
  // não conhece o mapa: ele usa o comportamento observável de
  // handleDomainError (traduz o que conhece, RELANÇA o que não conhece).
  describe('exhaustiveness over the exported domain errors', () => {
    /**
     * Erros de domínio que ainda NÃO têm status registrado no mapa, de
     * propósito, porque a rota que os traduz ainda não existe.
     *
     * Está vazia desde a Tarefa 07, que criou `/clubs/:clubId/books` e
     * `/books/:bookId` e registrou `[InvalidBookError, 400]` e
     * `[BookNotFoundError, 404]` — os dois últimos moradores. Um erro de
     * domínio novo só entra aqui enquanto REALMENTE não estiver mapeado: o
     * `it.each` abaixo cobra a limpeza no commit que o mapeia.
     */
    const NOT_YET_MAPPED: readonly string[] = [];

    type DomainErrorClass = new (message?: string) => Error;

    function isDomainErrorClass(value: unknown): value is DomainErrorClass {
      return typeof value === 'function' && value.prototype instanceof Error;
    }

    // O `Record<string, unknown>` alarga o tipo do namespace para o predicado
    // poder estreitar: sem ele, o alvo do filter é a união exata das classes
    // de hoje, e é justamente essa lista fechada que o teste não quer conhecer.
    const EXPORTED: ReadonlyArray<readonly [string, DomainErrorClass]> =
      Object.entries(domainErrors as Record<string, unknown>).filter(
        (entry): entry is [string, DomainErrorClass] =>
          isDomainErrorClass(entry[1]),
      );

    // Se a enumeração vier vazia (um refactor que renomeie o módulo, por
    // exemplo), os testes abaixo passariam vazios e não provariam nada.
    it('finds the exported domain error classes', () => {
      expect(EXPORTED.length).toBeGreaterThanOrEqual(15);
      expect(EXPORTED.map(([name]) => name)).toContain('ClubNotFoundError');
    });

    it('gives every exported domain error a status', () => {
      const unmapped: string[] = [];

      for (const [name, ErrorClass] of EXPORTED) {
        if (NOT_YET_MAPPED.includes(name)) continue;

        const reply = replySpy();
        try {
          handleDomainError(new ErrorClass('detalhe'), reply);
        } catch {
          // Relançou: não está no mapa, então viraria 500 na rota.
          unmapped.push(name);
          continue;
        }
        expect(reply.sent).toHaveLength(1);
      }

      expect(unmapped).toEqual([]);
    });

    // O outro lado da lista: um nome só pode ficar aqui enquanto REALMENTE
    // não estiver mapeado. Quando a Tarefa 07 registrar o status e esquecer de
    // remover o nome, este teste estoura e cobra a limpeza.
    it.each(NOT_YET_MAPPED)(
      'still has no status for %s, which is pending by design',
      (name) => {
        const entry = EXPORTED.find(([exported]) => exported === name);
        // A lista não pode citar um erro que não existe mais (renomeado ou
        // apagado) — senão ela viraria uma isenção fantasma.
        expect(entry, `${name} is not exported by domain/errors`).toBeDefined();

        const ErrorClass = entry?.[1];
        expect(ErrorClass).toBeDefined();
        if (!ErrorClass) return;

        const reply = replySpy();
        expect(() =>
          handleDomainError(new ErrorClass('detalhe'), reply),
        ).toThrow();
        expect(reply.sent).toEqual([]);
      },
    );
  });

  // NotAMemberError (404) e ForbiddenRoleError (403) são a barreira entre
  // "esse clube não existe para você" e "você está no clube sem o papel".
  it('keeps NotAMemberError and ForbiddenRoleError on different statuses', () => {
    const notMember = replySpy();
    const forbidden = replySpy();

    handleDomainError(new NotAMemberError('x'), notMember);
    handleDomainError(new ForbiddenRoleError('y'), forbidden);

    expect(notMember.sent[0]?.statusCode).toBe(404);
    expect(forbidden.sent[0]?.statusCode).toBe(403);
  });

  /**
   * A mesma barreira, do lado da nota: "essa nota não existe para você" (404,
   * o corte de tenant) × "essa nota é de outra pessoa" (403, o ADR 0002 — o
   * clube já lê a nota, esconder não protegeria nada). Colapsar os dois num
   * status só é o que faz o front mostrar a mensagem errada.
   */
  it('keeps NoteNotFoundError and NotTheAuthorError on different statuses', () => {
    const notFound = replySpy();
    const notAuthor = replySpy();

    handleDomainError(new NoteNotFoundError('x'), notFound);
    handleDomainError(new NotTheAuthorError('y'), notAuthor);

    expect(notFound.sent[0]?.statusCode).toBe(404);
    expect(notAuthor.sent[0]?.statusCode).toBe(403);
  });
});
