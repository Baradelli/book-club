import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Config própria de teste — sem Tailwind e sem o plugin de PWA: nenhum teste
 * de UI depende de CSS ou de service worker, e carregá-los só tornaria a
 * suíte lenta e barulhenta.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    /**
     * ⚠️ **O FUSO DA SUÍTE É FIXO, E ISSO É O QUE TORNA "QUE DIA É HOJE"
     * DECIDÍVEL** — achado da revisão da Tarefa 17.
     *
     * As telas calculam o dia com `localDay(new Date(), localTimeZone())`, no
     * fuso de quem olha. MEDIDO: trocar isso por
     * `new Date().toISOString().slice(0, 10)` **sobrevivia** à suíte, porque em
     * jsdom o fuso do processo É o do teste — os dois só divergem em certas
     * horas, e o vermelho seria cara-ou-coroa no relógio (entre 21h e 24h
     * locais, para quem está em UTC−3). O `docs/CONVENCOES-CODIGO.md` §7.10 diz
     * exatamente isto: antes de escrever "não é testável aqui", tente a
     * ferramenta que ESCOLHE o ambiente.
     *
     * Com `TZ` pinado, um teste que congela o relógio em `2026-09-05T02:00:00Z`
     * põe "o dia em UTC" e "o dia de quem olha" em datas DIFERENTES por
     * construção — e aí o mutante do `toISOString()` fica vermelho todo dia, em
     * qualquer máquina. Os acusadores são `the day of the plan is read in the
     * time zone of whoever is looking` em `pages/__tests__/book.test.tsx` e o
     * par dele em `home.test.tsx`.
     *
     * `America/Sao_Paulo` porque é o fuso do dono (UTC−3, sem horário de verão
     * desde 2019) — o offset negativo é o que faz a virada do dia acontecer
     * ANTES da meia-noite UTC.
     */
    env: { TZ: 'America/Sao_Paulo' },
  },
});
