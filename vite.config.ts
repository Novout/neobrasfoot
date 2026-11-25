import vue from '@vitejs/plugin-vue'
import packageVersion from 'vite-plugin-package-version'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// O pacote publica os tipos no formato CommonJS: o TypeScript enxerga o módulo inteiro no import padrão.
// Em tempo de execução o import já é a função; o `.default` cobre o outro caso.
const packageVersionModule = packageVersion as unknown as (() => Plugin) & { default?: () => Plugin }
const version = packageVersionModule.default ?? packageVersionModule

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Versão do package.json em import.meta.env.PACKAGE_VERSION (mostrada na tela inicial).
    version(),
    // App instalável (PWA): manifesto + service worker que guarda o jogo para abrir offline.
    VitePWA({
      // Versões novas são baixadas em segundo plano; quando terminam, src/utils/pwaUpdate.ts ativa o service
      // worker novo e recarrega a página sozinho (esperando a partida ao vivo parar). O save fica no localStorage.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: 'Neobrasfoot',
        short_name: 'Neobrasfoot',
        description: 'Gerencie seu clube de futebol: escalação, mercado, estádio, campeonato e Copa do Brasil.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0d1712',
        background_color: '#0d1712',
        categories: ['games', 'sports'],
        // Ícones gerados a partir de public/logo.svg com `npm run generate-pwa-assets`.
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Rotas do vue-router (/dashboard, /pre-jogo...) abrem o app mesmo offline.
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    // happy-dom fornece localStorage, usado pelo salvamento automático das stores.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
