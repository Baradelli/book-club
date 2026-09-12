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
     *
     * ⚠️ **E NÃO TROQUE PARA `UTC` PARA "PADRONIZAR" COM OS OUTROS TRÊS
     * PACOTES. Medido na Tarefa 37, e a conta é esta:**
     *
     * | `TZ` | acusadores do mutante `toISOString().slice(0, 10)` |
     * |---|---|
     * | `America/Sao_Paulo` (este) | **2** — e são os dois nomeados acima |
     * | `UTC` | **0** |
     *
     * Em `UTC` os dois testes ficam vermelhos, mas **na PRECONDIÇÃO**
     * (`expected 'UTC' to be 'America/Sao_Paulo'`, o `expect(process.env['TZ'])`
     * que eles pinam no §7.2) — com o mutante e sem ele, exatamente igual. Ou
     * seja: eles nunca chegam à asserção, e o mutante deixa de ser julgado. Em
     * offset zero "o dia em UTC" e "o dia de quem olha" **são o mesmo dia por
     * construção**, então não existe fixture que separe os dois.
     *
     * Os outros três pacotes pinam `UTC` (veja
     * `packages/backend/vitest.workspace.ts`, onde a medição que obrigou os
     * pinos está colada por extenso): lá o offset zero **revela** um mutante
     * que o fuso do dono escondia, e aqui ele **esconde** um que o fuso do dono
     * revela. É a ressalva do ponto cego fixo com os papéis trocados, e é por
     * isso que os pinos são diferentes **de propósito**. Nenhum dos dois é o
     * "padrão certo": cada um é o fuso em que a propriedade daquele pacote é
     * decidível (§7.10).
     *
     * A precondição pinada é o que torna esta divergência segura: quem trocar o
     * fuso aqui recebe um vermelho **alto e nominal**, não uma suíte verde que
     * parou de provar alguma coisa.
     */
    env: { TZ: 'America/Sao_Paulo' },
  },
});
