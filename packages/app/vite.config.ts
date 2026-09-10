import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Um PWA responsivo só (`CLAUDE.md`): nunca `web/` e `mobile/` separados.
 *
 * Tailwind entra pelo plugin do Vite, e **não existe `tailwind.config.js`** —
 * os tokens vivem em CSS (`@clube/ui/theme.css`) e o app os declara em
 * `@theme inline` dentro de `src/styles.css`.
 */

/**
 * ⚠️ NÃO EXISTE MAIS EXCEÇÃO DE TREE-SHAKING AQUI, E ISSO É O CONSERTO — não um
 * esquecimento. Se você vier acrescentar uma, leia isto primeiro.
 *
 * A Tarefa 15 nasceu com `build.rollupOptions.treeshake.moduleSideEffects`
 * isentando duas famílias de módulo (`@tiptap`/`prosemirror-*`/`tippy.js` e
 * `packages/ui/src/**`), porque o primeiro `import { Button } from '@clube/ui'`
 * de uma tela real levou o bundle a **684 kB** com ProseMirror dentro: o barril
 * de `@clube/ui` reexportava o `RichEditor`, e o Rollup só remove o import de
 * um módulo cujos exports não são usados quando SABE que aquele módulo não tem
 * efeito colateral — o que ele sabe pelo campo `sideEffects` do `package.json`.
 * Nem `@tiptap/starter-kit`/`@tiptap/pm` nem `packages/ui` declaravam.
 *
 * A rodada de correção mediu as quatro combinações no mesmo build, e derrubou a
 * atribuição causal que estava escrita aqui (ela dizia que as DUAS isenções
 * eram necessárias):
 *
 * | barril de `ui` | `sideEffects` em `ui` | isenção | JS bruto | marcas |
 * |---|---|---|---|---|
 * | reexporta `RichEditor` | não | nenhuma | **684.692** | 43 |
 * | reexporta `RichEditor` | sim   | nenhuma | **342.579** | 0 |
 * | sem `RichEditor`       | não | nenhuma | **342.579** | 0 |
 * | sem `RichEditor`       | sim   | nenhuma | **342.579** | 0 |
 *
 * Ou seja: **cada uma das duas mudanças em `packages/ui` basta sozinha**, e as
 * duas foram feitas — a entrada de subpath `@clube/ui/editor` (que tira o
 * editor do grafo do barril, e é a garantia ESTRUTURAL) e o
 * `"sideEffects": ["**\/*.css"]` (a declaração honesta: os dois `.css` do
 * pacote são sujos de propósito, e é por isso que não é `false`).
 *
 * Com o editor fora do grafo, a isenção não tem mais nada a isentar — e ela
 * era ativamente ruim: o `EDITOR_ONLY_PACKAGES` casava
 * `tippy.js/dist/tippy.css` e SOBRESCREVIA o `"sideEffects": ["**\/*.css"]` que
 * o próprio `tippy.js` declara. Só não mordia porque o plugin `vite:css-post`
 * marca todo CSS como `no-treeshake`, e valor de plugin vence valor de config.
 *
 * O acusador de tudo isto é `src/__tests__/bundle-guard.test.ts`, que compila
 * de verdade. Bundle cresceu? O que entrou no grafo é a pergunta — não esta
 * config.
 */

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Decisão C da Tarefa 12: `autoUpdate`, não `prompt`. A UI de "nova
      // versão disponível" não existe, e um service worker velho é pior.
      //
      // ⚠️ Para a Tarefa 21: quando houver rascunho local, uma atualização que
      // recarrega no meio da digitação perde o texto — a menos que o rascunho
      // já esteja em IndexedDB, que é justamente o que a 21 constrói.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Clube do Livro',
        short_name: 'Clube',
        description: 'A leitura de hoje, junto com o clube',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#f5f2ec',
        theme_color: '#1c1a17',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // ⚠️ O CHUNK DO `en` FICA FORA DO PRECACHE (Tarefa 29a).
        //
        // Sem isto, tirar o `en` do chunk de entrada não economiza byte
        // nenhum de rede: o `globPatterns` acima varre todo `.js` do `dist/`,
        // e o install baixava o catálogo do mesmo jeito — medido, o precache
        // ia de 15 entradas / 887,15 KiB (antes da fatia) para 16 / 887,79
        // KiB. O download só mudava de momento.
        //
        // O preço, combinado: trocar para inglês SEM REDE não funciona, e cai
        // no `pt` pela decisão G (sem tela de erro). O acusador é
        // `src/__tests__/service-worker-config.test.ts`.
        globIgnores: ['assets/en-*.js'],
        navigateFallback: '/index.html',
        // Decisão D: offline é a Tarefa 21. O SW NÃO cacheia `/api` e o
        // navigateFallback NÃO engole chamada de API — devolver o index.html
        // para um GET /api/... é o bug clássico de PWA, e o front receberia
        // HTML onde espera JSON.
        navigateFallbackDenylist: [/^\/api\//, /^\/docs\//],
      },
      devOptions: {
        // Sem SW em desenvolvimento: cache de asset durante o dev esconde a
        // própria alteração que se está fazendo.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
