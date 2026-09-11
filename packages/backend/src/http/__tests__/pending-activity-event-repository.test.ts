import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PendingActivityEventRepository } from '../pending-activity-event-repository';

/**
 * ⚠️ **A GUARDA QUE SE AUTO-DESARMA — e por que ela existe.**
 *
 * A `PendingActivityEventRepository` é o remendo da Tarefa 33: o gatilho de
 * atividade nasceu com os quatro UseCases já roteados, mas o `model
 * ActivityEvent` do Prisma, a migration e o repositório real são a **Tarefa
 * 34**. Alguma coisa tinha de satisfazer o port hoje, senão o `typecheck` fica
 * vermelho em três arquivos de rota.
 *
 * O arquivo diz isso em prosa — no nome, no docblock e no comentário da linha
 * de `buildRepositories`. **E prosa não é guarda** (`docs/CONVENCOES-CODIGO.md`
 * §7.9: requisito sem guarda automática é intenção): medido na rodada de
 * correção da 33, `grep` achava três ocorrências e **zero** testes, então nada
 * falharia se a 34 esquecesse de apagar o remendo — e o sintoma seria um feed
 * silenciosamente vazio, descoberto só na tela da 35.
 *
 * Esta é a guarda, e ela tem a forma que o problema pede: **hoje ela passa, e
 * no dia em que a Tarefa 34 declarar o modelo ela fica VERMELHA até o remendo
 * ser apagado.** Ninguém precisa lembrar dela; ela lembra.
 *
 * ## Por que o gatilho é o `schema.prisma`, e não o cliente gerado
 *
 * O `schema.prisma` é a fonte da verdade, e o cliente é **derivado** dele: um
 * `Prisma.dmmf` desatualizado (quem declarou o modelo e ainda não rodou
 * `prisma generate`) deixaria a guarda dormindo justamente na janela em que ela
 * precisa acordar. Ler o schema torna a guarda imune a isso — e o instante em
 * que ela acorda é exatamente o instante em que o remendo deixou de ter razão
 * de existir.
 */

const BACKEND_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const SCHEMA = readFileSync(`${BACKEND_ROOT}/prisma/schema.prisma`, 'utf8');
const REPOSITORIES = readFileSync(
  `${BACKEND_ROOT}/src/http/repositories.ts`,
  'utf8',
);

/** O predicado da guarda: "a Tarefa 34 já declarou o modelo?". */
const DECLARES_MODEL = /^model ActivityEvent\s*\{/m;

describe('PendingActivityEventRepository', () => {
  /**
   * Ela **LANÇA**, e é decisão, não descuido. A decisão C da Tarefa 33 diz que
   * falhar registrando não pode derrubar a escrita da pessoa **e** que engolir
   * em silêncio também é errado: o `recordActivitySafely` captura e loga
   * `activity_event_not_recorded`. Um `save` que devolvesse sucesso e jogasse o
   * evento fora seria a única versão disto que ninguém descobre.
   */
  it('rejects, so that every dropped event leaves a log line', async () => {
    const repository = new PendingActivityEventRepository();

    await expect(repository.save()).rejects.toThrow(/Tarefa 34/);
  });

  // As pré-condições das duas leituras: um caminho errado devolveria string
  // vazia, e as asserções abaixo passariam sem ter olhado nada (§7.4).
  it('reads the real schema and the real composition root', () => {
    expect(SCHEMA).toContain('model Note {');
    expect(SCHEMA).toContain('model ReadingLog {');
    expect(REPOSITORIES).toContain('export function buildRepositories');
    expect(REPOSITORIES).toContain('activityEvents:');
  });

  /**
   * ⚠️ **A GUARDA.** Enquanto o modelo não existe, o remendo TEM de estar
   * ligado (senão a fiação das rotas está quebrada de outro jeito). No momento
   * em que ele existir, o remendo TEM de ter sumido.
   *
   * As duas metades importam: sem a primeira, apagar o arquivo hoje passaria
   * despercebido; sem a segunda, a 34 pode esquecer.
   */
  it('is wired until the ActivityEvent model exists, and gone the moment it does', () => {
    if (DECLARES_MODEL.test(SCHEMA)) {
      expect(REPOSITORIES).not.toContain('PendingActivityEventRepository');
    } else {
      expect(REPOSITORIES).toContain('PendingActivityEventRepository');
    }
  });

  /**
   * A prova de que a guarda **vira**, sem criar o modelo: o predicado é testado
   * contra um schema fabricado. Sem isto, um regex que nunca casasse deixaria o
   * `else` acima rodando para sempre — a guarda que parece cobrir e não cobre
   * (§7.9), e o motivo pelo qual a auditoria da 33 pediu esta simulação.
   */
  it('flips when a schema declares the model', () => {
    expect(DECLARES_MODEL.test(SCHEMA)).toBe(false);

    const asOfTask34 = `${SCHEMA}\n\nmodel ActivityEvent {\n  id String @id\n}\n`;
    expect(DECLARES_MODEL.test(asOfTask34)).toBe(true);

    // E não casa por acaso com uma menção em comentário nem com outro modelo
    // de nome parecido — é `model ActivityEvent {` no começo da linha.
    expect(
      DECLARES_MODEL.test('// modelos que ainda não existem (ActivityEvent)'),
    ).toBe(false);
    expect(DECLARES_MODEL.test('model ActivityEventDelivery {\n}')).toBe(false);
  });
});
