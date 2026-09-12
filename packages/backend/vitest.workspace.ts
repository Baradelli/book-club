import { defineWorkspace } from 'vitest/config';

/**
 * ⚠️ **O FUSO DOS TESTES É FIXO (`TZ=UTC`), NOS DOIS PROJETOS — e isto não é
 * zelo de configuração: é a premissa do MÉTODO deste projeto.**
 *
 * A auditoria de cada fatia se apoia em **teste de mutação**, e um veredito de
 * mutação só quer dizer alguma coisa se o ambiente for determinístico: "zero
 * acusadores" numa máquina que "acusa" em outra não é medição, é sorte do fuso
 * de quem rodou. Até a Tarefa 37 nada aqui fixava `TZ`, e o mesmo mutante dava
 * dois vereditos diferentes.
 *
 * ## A medição que obrigou a decisão (Tarefa 37, rodada de conserto)
 *
 * Mutante: em `src/usecases/_fakes/reading-plan-item-repository-fake.ts`,
 * trocar `item.date === filter.date` por
 * `new Date(item.date).getTime() === new Date(filter.date).getTime()`.
 *
 * - no fuso da máquina do dono (`America/Sao_Paulo`): **47/47 verdes, ZERO
 *   acusadores**;
 * - com `TZ=UTC`: **1 acusador** —
 *   `ReadingPlanItemRepositoryFake > find({ bookIds, date }) > matches the
 *   calendar day exactly: a different spelling is a different day`.
 *
 * A causa: `new Date('2026-10-5')` (grafia NÃO-ISO) é meia-noite **local**, e
 * `new Date('2026-10-05')` (ISO) é meia-noite **UTC**. Os dois instantes só
 * coincidem em offset zero — ou seja, o mutante que apaga a comparação
 * byte a byte só é visível onde o offset é zero.
 *
 * ## ⚠️ A ressalva honesta: isto troca VARIÂNCIA por um PONTO CEGO FIXO
 *
 * Fixar o fuso não torna a suíte mais sensível — torna o veredito **repetível**.
 * O preço é que o ponto cego passa a ser sempre o mesmo: pode existir mutante
 * que o offset zero **esconde** e um fuso deslocado revelaria (o exemplo acima
 * é o espelho disto, com os papéis trocados). A escolha é deliberada: um ponto
 * cego conhecido e igual para todo mundo é auditável; um que muda com a máquina
 * de quem rodou não é.
 *
 * ## A consequência para quem escreve teste
 *
 * **Quem precisa de um fuso específico PASSA O FUSO, explicitamente.** É o que
 * os testes do dispatcher já fazem, via `Settings.timezone`, e o que o
 * `localDay(instant, timeZone)` exige por assinatura. Nenhum teste deste
 * repositório pode depender do fuso do ambiente para dizer que dia é hoje — e
 * o único que mexe em `process.env.TZ` de propósito (o `local-day.test.ts` do
 * `shared`, que prova o FALLBACK de ambiente) o faz salvando e restaurando o
 * valor anterior, então continua funcionando com um `TZ` fixo por baixo.
 */
const TEST_TIME_ZONE = 'UTC';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts'],
      environment: 'node',
      env: { TZ: TEST_TIME_ZONE },
    },
  },
  {
    // Um fork só: os testes de contrato falam com o mesmo Postgres e criam
    // fixtures com ids próprios — rodar em paralelo embaralharia a limpeza.
    test: {
      name: 'integration',
      include: ['src/**/*.integration.test.ts'],
      environment: 'node',
      poolOptions: { forks: { singleFork: true } },
      env: { TZ: TEST_TIME_ZONE },
    },
  },
]);
