import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Config própria de teste — antes da Tarefa 13 o pacote rodava com o `include`
 * default do Vitest, diferente do `src/**` de `shared` e de `app` (achado da
 * Tarefa 12). Alinhado com `packages/app/vitest.config.ts`: `jsdom`, plugin do
 * React, e nada de Tailwind — nenhum teste daqui depende de CSS compilado.
 *
 * Quem depende de CSS compilado é o teste da regra 1, e ele mora no `app`,
 * porque é o `app` que compila.
 *
 * ============================================================================
 * `server.deps.inline` — O QUE A MEDIÇÃO DIZ, E SÓ ISSO
 * ============================================================================
 *
 * ⚠️ ESTA LINHA É LOAD-BEARING, e o motivo escrito aqui até a rodada de
 * correção era OUTRO — e era falso. Ele dizia que sem o inline o alias de
 * `tippy.js` não alcançaria o `dist` do TipTap e "o teste rodaria contra o
 * tippy de verdade e falharia por geometria". Não havia alias nenhum a
 * proteger: o fake do tippy e o alias foram apagados (medido: com o tippy de
 * verdade no jsdom a suíte fica igual — o `NotFoundError` da §11 nasce do
 * `element.remove()` do próprio `BubbleMenuView`, não do tippy), e o inline
 * CONTINUOU necessário.
 *
 * O que ele resolve, MEDIDO ao removê-lo: **5 testes** morrem com
 *
 *     TypeError: tippy is not a function
 *
 * Sem o inline, o Vitest externaliza o `dist` pré-empacotado do TipTap, e o
 * `import tippy from 'tippy.js'` que está lá dentro recebe o namespace do
 * módulo CJS em vez da função — o default export fica em `.default`. É interop
 * ESM/CJS, não geometria e não alias.
 *
 * Se um dia o `tippy.js` publicar ESM de verdade, ou o TipTap parar de
 * importá-lo por default, meça de novo antes de apagar.
 */
/**
 * ⚠️ **O FUSO DOS TESTES É FIXO — e a medição que obrigou isto está colada em
 * `packages/backend/vitest.workspace.ts`.** Leia lá; aqui fica só o porquê e a
 * ressalva, para ninguém apagar a linha achando que é enfeite.
 *
 * A auditoria de cada fatia se apoia em **teste de mutação**, e "zero
 * acusadores" só quer dizer alguma coisa se o ambiente for determinístico: o
 * mesmo mutante deu 0 acusadores no fuso da máquina do dono e 2 em `UTC`.
 *
 * ⚠️ **A ressalva honesta: isto troca VARIÂNCIA por um PONTO CEGO FIXO.** Pode
 * existir mutante que o offset zero esconde e um fuso deslocado revelaria —
 * `packages/app/vitest.config.ts` pina **`America/Sao_Paulo`** justamente por
 * isso, e o pino de lá tem acusador nomeado. Os dois são deliberados.
 *
 * Aqui `UTC` porque **nenhum componente deste pacote lê o relógio ou o fuso**
 * (medido na Tarefa 37: nenhum teste ficou vermelho ao fixar). O pino é
 * profilático — ele existe para que o dia em que um componente de data chegar,
 * o veredito já nasça repetível. **Quem precisar de um fuso específico PASSA O
 * FUSO**, nunca depende daqui.
 */
const TEST_TIME_ZONE = 'UTC';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    server: { deps: { inline: [/@tiptap\//] } },
    env: { TZ: TEST_TIME_ZONE },
  },
});
