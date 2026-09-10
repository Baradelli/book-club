import type { ClubMemberResponse } from '@clube/shared';

import type { ActiveClubMe } from '../club/active-club';

/**
 * QUEM ESCREVEU, PELO NOME — o `GET /clubs/:clubId/members` virando texto de
 * tela, num lugar só.
 *
 * ⚠️ **ELE NASCEU DE UMA DUPLICAÇÃO QUE A TAREFA 28 CRIOU, e o achado é o
 * registro.** Antes da fatia, `MembersState`, `MEMBERS_UNKNOWN` e
 * `nameOfWriter` existiam **só** no `book.tsx`. Ao tirar o acervo de lá, a tela
 * nova precisou dos três — e a fatia os **copiou**, byte a byte, com docblock
 * quase idêntico. Duas cópias.
 *
 * ⚠️ **E É EXATAMENTE A INCONSISTÊNCIA QUE A TAREFA 27 EXISTIU PARA FECHAR.**
 * Lá o defeito era a mesma pessoa aparecendo como "Maria" no acervo e como
 * "alguém do clube" na sobreposição do plano, dois dedos acima, na mesma tela.
 * A decisão G desta fatia ("o nome de quem escreveu vale para as duas metades,
 * pelo MESMO `nameOfWriter` — duas funções seriam duas verdades sobre o mesmo
 * nome") vale entre TELAS pelo mesmo motivo: consertar uma cópia e esquecer a
 * outra **reabre** a inconsistência. É a lição nº 3 do MVP 1 e o §7.1 do
 * `docs/CONVENCOES-CODIGO.md` ("extrair, não cobrir duas vezes"), que é a saída
 * que a Tarefa 23 tomou com o `matches` dos fakes.
 *
 * ⚠️ **DOIS CHAMADORES DE VERDADE, e é isso que distingue esta extração da do
 * `matchesText`** (§7.1: "helper compartilhado sem segundo chamador é
 * especulação"): o `acervo.tsx` (a autoria de cada linha, nas duas metades) e o
 * `book.tsx` (a sobreposição de autoria de cada dia do plano). Os dois já
 * existem, hoje, em árvore.
 *
 * ⚠️ **MÓDULO PRÓPRIO, E NÃO O `acervo-entries.ts`.** Aquele arquivo se declara
 * "o modelo do ACERVO", e o `book.tsx` não tem acervo nenhum desde esta fatia —
 * importar dali seria um nome que mente para metade dos chamadores. E ele
 * também não pode virar `.tsx`: o que o faz valer é justamente não saber o que é
 * React.
 *
 * Sem React aqui também: o único import de runtime é um TIPO, que o compilador
 * apaga. Ele não importa tela nenhuma, então não há ciclo possível (a medição da
 * Tarefa 20).
 */

/**
 * QUEM É O CLUBE — o estado da carga dos membros.
 *
 * ⚠️ **DUAS VARIANTES, E NÃO TRÊS — a correção medida da Tarefa 27.** Este
 * union tinha `loading`, `ready` e `failed`, e o `failed` era **peso morto**:
 * mutar o `setMembers({ status: 'failed' })` para nada dava **0 acusadores**,
 * porque `loading` degrada exatamente igual. Um estado sem consequência é um
 * estado que ninguém pode acusar — e ele fazia um teste parecer provar "a FALHA
 * é vista" quando ele provava "o não-`ready` degrada".
 *
 * A verdade é que as duas telas só precisam saber **se conhecem as pessoas**:
 * não há frase de erro (o nome degrada em silêncio para o glifo neutro — o
 * conteúdo é o acervo e o plano, não o filtro) e não há botão próprio. Quando a
 * falha ganhar ação própria, ela **volta** a ser uma variante — com
 * comportamento e com teste.
 */
export type MembersState =
  | { status: 'unknown' }
  | { status: 'ready'; members: readonly ClubMemberResponse[] };

export const MEMBERS_UNKNOWN: MembersState = { status: 'unknown' };

/**
 * `userId` → nome, para TODO membro — `ACTIVE` e `ARCHIVED`.
 *
 * ⚠️ **É AQUI QUE A DECISÃO A DA TAREFA 26a É COBRADA**: a rota devolve os
 * arquivados **exclusivamente** para isto. Sair do clube arquiva o `Membership`
 * e não apaga o que a pessoa escreveu — "o acervo do clube continua íntegro,
 * **com autoria**" (`docs/adr/0002-visibilidade-total-no-clube.md`) —, então
 * quem saiu não vira chip de filtro e continua tendo nome no que deixou.
 *
 * O `Map` é montado uma vez por resposta (as telas o embrulham num `useMemo`):
 * a resolução por linha é O(1), e são dezenas de linhas.
 */
export function memberNamesOf(
  members: MembersState,
): Map<string, string | null> {
  return new Map<string, string | null>(
    members.status === 'ready'
      ? members.members.map((member) => [member.userId, member.name])
      : [],
  );
}

/**
 * O nome de quem escreveu — `null` quando não se sabe.
 *
 * ⚠️ **O `me` VEM PRIMEIRO, e não é redundância**: o `/me` responde antes de
 * `GET /clubs/:id/members` no caminho comum, e sou eu que apareço na tela
 * primeiro. Sem esta ordem, o meu avatar cairia no glifo neutro no frame entre
 * as duas respostas — o que a Tarefa 18 pagou para não acontecer.
 *
 * ⚠️ **E NUNCA O `userId` COMO NOME**: com o id, o `PersonAvatar` extrai a
 * primeira letra do UUID e desenha um "F" ou um "C" — uma inicial que **tem
 * cara de inicial e não é de ninguém** (medido na Tarefa 17). Comunicar errado é
 * pior que não comunicar, e `null` cai no glifo neutro que a Tarefa 13 pôs ali
 * exatamente para "sem nome", escolhido para não parecer cobrança. A **cor** do
 * avatar continua vindo do `id`, então duas pessoas seguem distinguíveis entre
 * si; o que falta é saber QUAL delas é você.
 *
 * O `me` é `null` fora do `ready` do `/me` — nesse frame todo avatar cai no
 * glifo neutro, que é a resposta honesta para "ainda não sei quem é você".
 */
export function nameOfWriter(
  userId: string,
  me: ActiveClubMe | null,
  names: Map<string, string | null>,
): string | null {
  if (me !== null && userId === me.id) return me.name;
  return names.get(userId) ?? null;
}
