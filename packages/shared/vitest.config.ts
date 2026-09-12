import { defineConfig } from 'vitest/config';

/**
 * ⚠️ **O FUSO DOS TESTES É FIXO — e a medição que obrigou isto está colada em
 * `packages/backend/vitest.workspace.ts`.** Leia lá; aqui fica só o porquê e a
 * ressalva, para ninguém apagar a linha achando que é enfeite.
 *
 * A auditoria de cada fatia se apoia em **teste de mutação**, e "zero
 * acusadores" só quer dizer alguma coisa se o ambiente for determinístico: o
 * mesmo mutante deu 0 acusadores no fuso da máquina do dono e 2 em `UTC`. Um
 * veredito que muda com quem rodou não é medição.
 *
 * ⚠️ **A ressalva honesta: isto troca VARIÂNCIA por um PONTO CEGO FIXO.** Pode
 * existir mutante que o offset zero esconde e um fuso deslocado revelaria — e
 * não é hipótese: `packages/app/vitest.config.ts` pina
 * **`America/Sao_Paulo`** de propósito, porque lá o acusador do mutante
 * `toISOString().slice(0, 10)` só existe com offset NEGATIVO. Os dois pinos
 * são deliberados e diferentes; nenhum dos dois é o "padrão certo".
 *
 * Aqui `UTC` porque é o fuso em que este pacote é interessante: o `local-day`
 * recebe o fuso **por parâmetro**, e o único teste que depende do ambiente é o
 * do FALLBACK — que escolhe o próprio fuso mexendo em `process.env.TZ` e o
 * restaura no `finally`, então continua decidindo tudo o que decidia.
 *
 * **Quem precisa de um fuso específico PASSA O FUSO**, nunca depende daqui.
 */
const TEST_TIME_ZONE = 'UTC';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { TZ: TEST_TIME_ZONE },
  },
});
