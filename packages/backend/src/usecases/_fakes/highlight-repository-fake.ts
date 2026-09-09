import type { Highlight } from '../../domain/highlight';
import type {
  HighlightPatch,
  HighlightRepository,
} from '../ports/highlight-repository';

export class HighlightRepositoryFake implements HighlightRepository {
  private store = new Map<string, Highlight>();
  private saveCallCount = 0;
  private updateCallCount = 0;

  /**
   * ⚠️ **NENHUM ÍNDICE ÚNICO É EMULADO AQUI, e é decisão medida** — a direção
   * restritiva do §7.1, que esconde melhor porque a suíte fica verde.
   *
   * O grifo é **ilimitado**: não há chave natural, não há upsert por conteúdo, e
   * os índices do ADR 0004 (`@@index([bookId, color])`,
   * `@@index([bookId, userId])`) **não são únicos**. Um fake que recusasse o
   * segundo grifo idêntico reprovaria o caso legítimo — grifei o mesmo trecho
   * duas vezes, em releituras diferentes, com cores diferentes — e o teste do
   * "ilimitado" nasceria provando o comportamento errado.
   */
  async save(highlight: Highlight): Promise<Highlight> {
    // Conta antes de gravar, e é o que deixa os testes de caminho de erro dos
    // UseCases afirmarem "nada foi escrito" (§7.3).
    //
    // "Conta a chamada, não o sucesso" **não é distinguível aqui**: este `save`
    // não tem como recusar — nenhum índice único é emulado (veja acima), e grifo
    // é ilimitado —, então chamada e sucesso coincidem, e nenhum mutante os
    // separaria. Onde a distinção É decidível é no `update`, que recusa id
    // desconhecido e conta a tentativa mesmo assim: prova em
    // `counts every update call, including the one it refused` (§7.10).
    this.saveCallCount += 1;

    this.store.set(highlight.id, this.clone(highlight));
    return this.clone(highlight);
  }

  /**
   * O grifo por id — **inclusive arquivado**, como o port manda. Esconder aqui
   * tiraria do domínio a decisão de tratar arquivado e inexistente igual.
   */
  async byId(id: string): Promise<Highlight | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  /**
   * O patch é `HighlightPatch`, e é o que torna este método simples.
   *
   * ⚠️ **Campo a campo, e não `{ ...existing, ...patch }`** — é o que fecha o
   * buraco que o tipo sozinho não fecha (§7.1.1). A checagem de propriedade em
   * excesso do TypeScript só vale para **literal fresco**:
   * `update(id, { userId })` é recusado pelo compilador, mas um patch montado
   * por variável atravessa, e o spread obedeceria enquanto o `toUpdateData` do
   * Prisma (Tarefa 24) ignoraria em silêncio — a divergência do §7.1 de volta,
   * na direção que deixa a suíte verde. Aqui a lista das nove chaves do
   * `HighlightPatch` é a barreira de runtime, e a única coisa que uma chave a
   * mais no patch encontra é o chão.
   */
  async update(id: string, patch: HighlightPatch): Promise<Highlight> {
    // Conta a CHAMADA, não o sucesso: um update recusado também foi uma
    // tentativa de escrita, e é isso que a regra 15 quer saber.
    this.updateCallCount += 1;

    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(
        `HighlightRepositoryFake: cannot update highlight ${id} — it was never saved`,
      );
    }

    // `undefined` é "não mexe" e `null` é "grave nulo", como no Prisma — é o
    // que o `!== undefined` de cada linha preserva.
    const next: Highlight = { ...existing };
    if (patch.quote !== undefined) next.quote = patch.quote;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.page !== undefined) next.page = patch.page;
    if (patch.reference !== undefined) next.reference = patch.reference;
    if (patch.commentDoc !== undefined) next.commentDoc = patch.commentDoc;
    if (patch.commentText !== undefined) next.commentText = patch.commentText;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.archivedAt !== undefined) next.archivedAt = patch.archivedAt;
    if (patch.updatedAt !== undefined) next.updatedAt = patch.updatedAt;

    // O clone corta o aliasing de `Date` e do `commentDoc` que venham pelo patch.
    const updated = this.clone(next);

    this.store.set(id, updated);
    return this.clone(updated);
  }

  /**
   * O acervo, para os testes olharem.
   *
   * ⚠️ **ARMADILHA DELIBERADA — não "conserte" esta ordem.** Enumera na ordem
   * INVERSA à de inserção. Não é bug: nasceu de um teste de ordenação da Tarefa
   * 07 que passava com a implementação errada só porque os fixtures estavam na
   * ordem esperada — um falso verde perfeito. A ordem que o Postgres devolve sem
   * `ORDER BY` é indefinida de verdade (depende de plano de execução e de
   * `VACUUM`), então "invertida" é tão fiel quanto qualquer outra — e é a única
   * que **falha** quando alguém confia na ordem do repositório. → §7.2.
   *
   * A armadilha nasce nesta fatia mesmo **sem `find` ainda**: quando o `find`
   * chegar (Tarefa 23), ele usa o MESMO `inReverseInsertionOrder`, e o
   * `listHighlights` já vai encontrar a armadilha pronta em vez de ganhar uma
   * ordem "natural" de que alguém poderia depender no meio do caminho.
   *
   * O corolário, que é a parte fácil de esquecer: um teste cujo assunto **não
   * é** a ordem não deve depender dela — ordene antes de comparar, ou use
   * `arrayContaining` + `toHaveLength`. A ordem tem teste dedicado
   * (`enumerates in reverse insertion order`); é lá que ela é assunto.
   */
  get saved(): Highlight[] {
    return this.inReverseInsertionOrder().map((highlight) =>
      this.clone(highlight),
    );
  }

  /**
   * Quantas vezes `save` foi chamado. Aqui isso é o mesmo que "quantas vezes
   * gravou": este `save` não recusa nada (veja o comentário dele) — a distinção
   * entre chamada e sucesso só é decidível no `updateCalls`.
   *
   * Existe para os testes de caminho de erro dos UseCases poderem afirmar "nada
   * foi escrito", e para a regra 9 poder afirmar também o lado POSITIVO
   * (`toBe(1)` no caminho feliz): um contador só afirmado como `toBe(0)` é meio
   * contador — um incremento que alguém apague deixa todo `toBe(0)` passar por
   * acidente, e aí ele é a asserção vazia do §7.4. Mesmo padrão do
   * `compareCalls` do PasswordHasherFake (§6.4).
   */
  get saveCalls(): number {
    return this.saveCallCount;
  }

  /**
   * Quantas vezes `update` foi chamado — a chamada, não o sucesso.
   *
   * Existe pelo mesmo motivo do `saveCalls`, e ainda por um: `update` com patch
   * vazio é no-op, então `saved` inalterado não distingue "não chamou o repo" de
   * "chamou e o patch não mudou nada" — e "chamou à toa" é um `UPDATE` por
   * request em toda tela que salva sem mudar nada (regra 15).
   */
  get updateCalls(): number {
    return this.updateCallCount;
  }

  private inReverseInsertionOrder(): Highlight[] {
    return [...this.store.values()].reverse();
  }

  /**
   * Clona nos dois sentidos (entrada do save e saída da leitura): nem o chamador
   * contamina o store, nem o store devolve referência sua.
   *
   * As `Date` precisam ser copiadas — o Prisma devolve `Date` nova a cada
   * leitura — e o `commentDoc` precisa de clone PROFUNDO: é uma árvore, o único
   * campo mutável por dentro, e o Prisma o reparseia do JSON a cada leitura.
   */
  private clone(highlight: Highlight): Highlight {
    return {
      ...highlight,
      // `structuredClone(null)` é `null`, mas um `{ ...doc }` cego viraria `{}`
      // — e um grifo sem comentário passaria a ter um doc vazio no lugar de nada.
      commentDoc:
        highlight.commentDoc === null
          ? null
          : structuredClone(highlight.commentDoc),
      createdAt: new Date(highlight.createdAt),
      updatedAt: new Date(highlight.updatedAt),
      // null preservado: new Date(null) seria a epoch, não null.
      archivedAt:
        highlight.archivedAt === null ? null : new Date(highlight.archivedAt),
    };
  }
}
