import type { Highlight } from '../domain/highlight';
import type { AssertMembership } from './assert-membership';
import { highlightForAuthor } from './highlight-for-author';
import type { HighlightRepository } from './ports/highlight-repository';

export interface ArchiveHighlightInput {
  actorUserId: string; // tem de ser o AUTOR
  highlightId: string;
}

export interface ArchiveHighlightOutput {
  highlight: Highlight;
}

/**
 * Soft delete do grifo: o autor tira da listagem o que não serve mais.
 *
 * **Não exige papel, e papel nenhum substitui autoria**: nem o `OWNER` do clube
 * nem o super-admin arquivam o grifo de outra pessoa (ADR 0002). É por isso que
 * o `requireRole` do `archiveBook` NÃO aparece aqui — livro é do grupo, grifo é
 * de quem grifou.
 *
 * **Não apaga conteúdo**: `quote`, `color`, `page`, `reference`, `commentDoc` e
 * `commentText` ficam intactos. Arquivar é tirar da vista, não destruir — o
 * acervo do clube continua íntegro. Hard delete não existe nesta fatia (o port
 * nem tem `delete`), e desarquivar é MVP 4.
 */
export class ArchiveHighlight {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly highlights: HighlightRepository,
  ) {}

  async execute(input: ArchiveHighlightInput): Promise<ArchiveHighlightOutput> {
    const highlight = await highlightForAuthor(
      this.highlights,
      this.assertMembership,
      {
        actorUserId: input.actorUserId,
        highlightId: input.highlightId,
      },
    );

    // Grifo já arquivado nem chega aqui: o guard o trata como inexistente
    // (`HighlightNotFoundError`). Então não há caminho que regrave um
    // `archivedAt` antigo — é o precedente do `archiveNote` e do `archiveBook`.
    //
    // UM `new Date()` só para os dois campos, e o motivo é SEMÂNTICO, não de
    // determinismo de teste: arquivar é UM evento, então "quando foi arquivado" e
    // "quando a linha mudou pela última vez" são o mesmo instante (ADR 0008).
    //
    // ⚠️ **Medido:** dois `new Date()` aqui NÃO divergem em milissegundos — as
    // duas chamadas caem no mesmo tick, e o mutante com um por campo passava em
    // 1206/1206 testes (§7.1: prosa não é prova). Quem acusa é o
    // `reads the clock once for both archivedAt and updatedAt`, com o stub de
    // relógio que anda a cada leitura.
    const archivedAt = new Date();

    // O `updatedAt` ANDA ao arquivar. → ADR 0008: o domínio é o dono de
    // `updatedAt` (o `Highlight` nasce SEM `@updatedAt` no schema — é a Tarefa
    // 24 que declara a coluna, e o §6 do plano de produto, que diz
    // `@updatedAt`, está desatualizado), e `updatedAt` significa "quando esta
    // linha mudou pela última vez" — arquivar muda a linha. A leitura antiga
    // ("última edição de conteúdo") exigiria uma terceira coluna para "última
    // mudança de linha", que ninguém pediu.
    //
    // O patch é literal e mínimo: nada de espalhar o grifo carregado de volta,
    // que é como um campo de conteúdo seria reescrito por acidente.
    const updated = await this.highlights.update(highlight.id, {
      status: 'ARCHIVED',
      archivedAt,
      updatedAt: archivedAt,
    });

    return { highlight: updated };
  }
}
