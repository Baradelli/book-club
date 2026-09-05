import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
  createIndexedDbPendingNoteStore,
  createUnavailablePendingNoteStore,
  openPendingNoteStore,
  pendingNoteKey,
  type PendingNoteStore,
  StoreUnavailableError,
} from '../store';
import { createPendingNoteStoreFake } from './pending-note-store-fake';

/**
 * ⚠️ **O TESTE DE CONTRATO DA STORE — O MESMO ARQUIVO, AS DUAS
 * IMPLEMENTAÇÕES** (decisão G da Tarefa 21, e §7.1 do
 * `docs/CONVENCOES-CODIGO.md`).
 *
 * O fake em memória é o que as telas usam: rápido, inspecionável, sem
 * transação. O IndexedDB é o que a pessoa usa no metrô. Sem um teste que rode
 * as MESMAS regras nos dois, eles divergem em silêncio — e a divergência
 * aparece só quando o texto de alguém não volta.
 *
 * O `describe.each` é o que torna isso estrutural: uma regra nova aqui nasce
 * exigida das duas, e não há como corrigir uma e esquecer a outra.
 *
 * O IndexedDB de verdade vem do `fake-indexeddb` (o jsdom não implementa
 * IndexedDB), e cada teste ganha uma `new IDBFactory()` — um banco vazio,
 * isolado, sem estado deixado pelo teste anterior (§6.6).
 */

const MARCOS = 'u-marcos';
const MARIA = 'u-maria';

/**
 * ⚠️ **OS DOIS DIAS SÃO ESCOLHIDOS PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2 e
 * §7.8): quem entra PRIMEIRO na fila é o que vem por ÚLTIMO na ordem de chave.
 *
 * O `getAll()` do IndexedDB enumera por chave primária e o `Map` do fake por
 * inserção — nenhuma das duas é a ordem da fila. Com `zebra` antes de `abelha`,
 * uma implementação que devolvesse a enumeração crua fica vermelha nas duas.
 */
const FIRST_DAY = 'p-zebra';
const SECOND_DAY = 'p-abelha';

/** Fixture é factory (§7.7) — e o `doc` é uma árvore MUTÁVEL por dentro. */
function aDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

const implementations: ReadonlyArray<
  readonly [name: string, create: () => PendingNoteStore]
> = [
  ['the in-memory fake', () => createPendingNoteStoreFake()],
  [
    'IndexedDB for real (fake-indexeddb)',
    () => createIndexedDbPendingNoteStore(new IDBFactory()),
  ],
];

describe.each(implementations)(
  'the pending note store — %s',
  (_name, create) => {
    it('keeps a draft of a day, and a draft is NOT a queued write (rule 1)', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o dragao'),
      });

      const draft = await store.byDay(MARCOS, FIRST_DAY);
      expect(draft?.doc).toEqual(aDoc('o dragao'));
      // `seq === null` é o que separa "guardado aqui" de "esperando a rede".
      expect(draft?.seq).toBeNull();
      expect(await store.queue(MARCOS)).toEqual([]);
    });

    it('REPLACES the draft of the same day instead of piling versions up', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('primeira'),
      });
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('segunda'),
      });

      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
        aDoc('segunda'),
      );
    });

    it('keeps the draft of one day out of ANOTHER day (rule 4)', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('do dia do dragao'),
      });

      expect(await store.byDay(MARCOS, SECOND_DAY)).toBeUndefined();
    });

    it('keeps the draft of one person out of ANOTHER person (rule 4, decision E)', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o que EU escrevi'),
      });

      // O aparelho é de casa: a outra pessoa entra e não vê — nem herda — o
      // rascunho de quem estava antes.
      expect(await store.byDay(MARIA, FIRST_DAY)).toBeUndefined();
      expect(await store.queue(MARIA)).toEqual([]);
    });

    it('queues a write, and only in the queue of its own person (decision E)', async () => {
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('sem rede'),
        },
        'enqueue',
      );

      const queue = await store.queue(MARCOS);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.doc).toEqual(aDoc('sem rede'));
      expect(queue[0]?.planItemId).toBe(FIRST_DAY);
      expect(await store.queue(MARIA)).toEqual([]);
    });

    it('⚠️ REPLACES the queued write of the same day — the queue does NOT grow (rule 6)', async () => {
      /*
        A regra 6, e ela é o motivo de a fila existir com chave: dez minutos
        escrevendo offline enfileirariam dezenas de versões do MESMO documento,
        e a volta da conexão viraria uma saraivada de `PUT` — todos vencidos
        menos o último.
      */
      const store = create();
      // ⚠️ A SEQUÊNCIA REAL, e ela importa (§7.1): a tela grava o rascunho a
      // cada tecla e só depois a tentativa de rede falha e pede lugar na fila.
      for (const text of ['um', 'dois', 'tres', 'quatro']) {
        const input = {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc(text),
        };
        await store.saveDraft(input);
        await store.settle(input, 'enqueue');
      }

      const queue = await store.queue(MARCOS);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.doc).toEqual(aDoc('quatro'));
    });

    it('enumerates the queue in the order the entries went IN (rule 9)', async () => {
      // ⚠️ A PRECONDIÇÃO PINADA (§7.2): a ordem de chave é o OPOSTO da ordem
      // de entrada. Um `pendingNoteKey` renomeado devolveria a coincidência em
      // silêncio, e este teste passaria a não provar ordem nenhuma.
      expect(
        pendingNoteKey(MARCOS, SECOND_DAY) < pendingNoteKey(MARCOS, FIRST_DAY),
      ).toBe(true);

      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('primeiro'),
        },
        'enqueue',
      );
      await store.settle(
        {
          userId: MARCOS,
          planItemId: SECOND_DAY,
          doc: aDoc('segundo'),
        },
        'enqueue',
      );

      expect(
        (await store.queue(MARCOS)).map((entry) => entry.planItemId),
      ).toEqual([FIRST_DAY, SECOND_DAY]);
    });

    it('keeps the PLACE of an entry that is written again (rules 6, 9)', async () => {
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('primeiro'),
        },
        'enqueue',
      );
      await store.settle(
        {
          userId: MARCOS,
          planItemId: SECOND_DAY,
          doc: aDoc('segundo'),
        },
        'enqueue',
      );
      const corrected = {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('primeiro, corrigido'),
      };
      await store.saveDraft(corrected);
      await store.settle(corrected, 'enqueue');

      const queue = await store.queue(MARCOS);
      // Continua sendo o primeiro da fila, com o texto novo: substituir não é
      // "sair e voltar para o fim".
      expect(queue.map((entry) => entry.planItemId)).toEqual([
        FIRST_DAY,
        SECOND_DAY,
      ]);
      expect(queue[0]?.doc).toEqual(aDoc('primeiro, corrigido'));
    });

    it('lets typing update a QUEUED write without dropping it out of the queue', async () => {
      // O caminho real de quem continua escrevendo sem sinal: o rascunho é
      // gravado a cada tecla, e a entrada da fila não pode evaporar por isso.
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('sem rede'),
        },
        'enqueue',
      );
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('sem rede, e mais uma frase'),
      });

      const queue = await store.queue(MARCOS);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.doc).toEqual(aDoc('sem rede, e mais uma frase'));
    });

    it('takes a write OUT of the queue and KEEPS the draft (rule 12)', async () => {
      /*
        A regra 12: um `4xx` permanente tira a entrada da fila (senão ela nunca
        esvazia) e **não** apaga o rascunho — o texto é da pessoa.
      */
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('recusado pelo servidor'),
        },
        'enqueue',
      );

      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('recusado pelo servidor'),
        },
        'dequeue',
      );

      expect(await store.queue(MARCOS)).toEqual([]);
      const draft = await store.byDay(MARCOS, FIRST_DAY);
      expect(draft?.doc).toEqual(aDoc('recusado pelo servidor'));
      expect(draft?.seq).toBeNull();
    });

    it('forgets the draft AND the queued write together (rules 3, 10)', async () => {
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('salvo no servidor'),
        },
        'enqueue',
      );

      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('salvo no servidor'),
        },
        'forget',
      );

      expect(await store.byDay(MARCOS, FIRST_DAY)).toBeUndefined();
      expect(await store.queue(MARCOS)).toEqual([]);
    });

    /*
      ⚠️ **O COMPARE-AND-WRITE — O BLOQUEADOR DA AUDITORIA, PROVADO ONDE ELE É
      DECIDÍVEL.**

      A janela não é de microtarefa: ela tem a largura do `PUT` inteiro, que no
      metrô são segundos. Nesses segundos a pessoa continua digitando, e o
      rascunho seguinte grava por cima do MESMO registro. Se o destino da escrita
      que subiu fosse aplicado assim mesmo, o `forget` apagaria o texto NOVO — do
      disco e, como ele nunca chegou ao servidor, de todo lugar. Com a tela
      dizendo "Salvo".

      Os três destinos são testados, porque os três escrevem no registro.
    */
    it('⚠️ does NOT forget a record whose doc CHANGED while the PUT was in flight', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o que subiu'),
      });
      // A pessoa digitou de novo enquanto o `PUT` estava no ar.
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o que subiu, e mais uma frase'),
      });

      // O servidor confirma o documento ANTIGO.
      await store.settle(
        { userId: MARCOS, planItemId: FIRST_DAY, doc: aDoc('o que subiu') },
        'forget',
      );

      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
        aDoc('o que subiu, e mais uma frase'),
      );
    });

    it('⚠️ does NOT take a CHANGED record out of the queue — that text is another write', async () => {
      const store = create();
      await store.settle(
        { userId: MARCOS, planItemId: FIRST_DAY, doc: aDoc('o que subiu') },
        'enqueue',
      );
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o texto novo'),
      });

      await store.settle(
        { userId: MARCOS, planItemId: FIRST_DAY, doc: aDoc('o que subiu') },
        'dequeue',
      );

      // Continua na fila, com o texto novo: ele nunca foi ao servidor, e sair
      // da fila aqui o deixaria parado para sempre.
      const queue = await store.queue(MARCOS);
      expect(queue).toHaveLength(1);
      expect(queue[0]?.doc).toEqual(aDoc('o texto novo'));
    });

    it('⚠️ does NOT overwrite a CHANGED record when queueing what failed', async () => {
      const store = create();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o texto novo'),
      });

      // O `PUT` do documento ANTIGO falhou por rede, e chega atrasado.
      await store.settle(
        { userId: MARCOS, planItemId: FIRST_DAY, doc: aDoc('o que subiu') },
        'enqueue',
      );

      // O registro continua com o texto novo — e ele NÃO ficou de fora da fila
      // por isso: a próxima tentativa da tela é quem lhe dá o lugar.
      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
        aDoc('o texto novo'),
      );
    });

    it('forgets ONLY that day of that person (rule 4)', async () => {
      const store = create();
      await store.settle(
        {
          userId: MARCOS,
          planItemId: FIRST_DAY,
          doc: aDoc('meu dia 1'),
        },
        'enqueue',
      );
      await store.settle(
        {
          userId: MARCOS,
          planItemId: SECOND_DAY,
          doc: aDoc('meu dia 2'),
        },
        'enqueue',
      );
      await store.settle(
        {
          userId: MARIA,
          planItemId: FIRST_DAY,
          doc: aDoc('o dia dela'),
        },
        'enqueue',
      );

      await store.settle(
        { userId: MARCOS, planItemId: FIRST_DAY, doc: aDoc('meu dia 1') },
        'forget',
      );

      expect(
        (await store.queue(MARCOS)).map((entry) => entry.planItemId),
      ).toEqual([SECOND_DAY]);
      expect((await store.queue(MARIA))[0]?.doc).toEqual(aDoc('o dia dela'));
    });

    it('gives nothing back for a day nobody ever wrote on', async () => {
      const store = create();

      expect(await store.byDay(MARCOS, FIRST_DAY)).toBeUndefined();
      expect(await store.queue(MARCOS)).toEqual([]);
    });

    it('gives the doc back EXACTLY as it went in (§7.6)', async () => {
      /*
        Losslessness por snapshot antes/depois, nunca por `toBe` de campo
        escolhido à mão (§7.6): o nó que a store perdesse seria justamente o que
        ninguém pensou em listar. E o `doc` é `passthrough` (ADR 0001) — marca,
        atributo e nó aninhado que o TipTap emitir têm de voltar iguais.
      */
      const store = create();
      const doc: Record<string, unknown> = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }, { type: 'italic' }],
                text: 'A promessa',
              },
            ],
          },
          { type: 'bulletList', content: [{ type: 'listItem', content: [] }] },
        ],
      };
      const before = structuredClone(doc);

      await store.saveDraft({ userId: MARCOS, planItemId: FIRST_DAY, doc });

      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(before);
    });

    it('does not hand out the very tree it was given (the caller keeps mutating it)', async () => {
      /*
        ⚠️ §7.1 na direção que só o IndexedDB tem de graça: ele CLONA
        estruturalmente o que grava. Um fake que guardasse a referência deixaria
        o editor mutar o que já está "salvo" — e o teste de tela provaria uma
        store que a produção não tem.
      */
      const store = create();
      const doc = aDoc('original');
      await store.saveDraft({ userId: MARCOS, planItemId: FIRST_DAY, doc });

      doc['content'] = [];

      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
        aDoc('original'),
      );
    });
  },
);

/**
 * DECISÃO F: modo privado, cota estourada e navegador antigo existem. A store
 * indisponível **recusa**, e é o chamador que decide o que fazer — a tela volta
 * a se comportar como na Tarefa 18 (regra 17).
 *
 * Recusar (e não fingir que gravou) é o que impede a mentira do `queued`: um
 * no-op silencioso faria a tela dizer "vamos enviar quando a conexão voltar"
 * sobre uma fila que não existe.
 */
describe('the store that cannot open (decision F)', () => {
  it('refuses every operation instead of pretending it worked', async () => {
    const store = createUnavailablePendingNoteStore();
    const input = {
      userId: MARCOS,
      planItemId: FIRST_DAY,
      doc: aDoc('sem armazenamento'),
    };

    await expect(store.saveDraft(input)).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
    for (const fate of ['forget', 'enqueue', 'dequeue'] as const) {
      await expect(store.settle(input, fate)).rejects.toBeInstanceOf(
        StoreUnavailableError,
      );
    }
    await expect(store.byDay(MARCOS, FIRST_DAY)).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
    await expect(store.queue(MARCOS)).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
  });

  it('is what the app gets where there is no IndexedDB at all (jsdom, private mode)', async () => {
    // O `openPendingNoteStore` é o que o `main.tsx` chama: sem `indexedDB` no
    // ambiente, ele não explode na importação — devolve a store que recusa.
    const store = openPendingNoteStore(undefined);

    await expect(store.queue(MARCOS)).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
  });

  it('uses the IndexedDB it was given when there IS one', async () => {
    // O outro lado do par: sem ele, um `openPendingNoteStore` que devolvesse a
    // store recusadora SEMPRE passaria no teste acima, e o app inteiro ficaria
    // sem fila em silêncio.
    const store = openPendingNoteStore(new IDBFactory());
    await store.settle(
      {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('guardado de verdade'),
      },
      'enqueue',
    );

    expect((await store.queue(MARCOS))[0]?.doc).toEqual(
      aDoc('guardado de verdade'),
    );
  });
});
