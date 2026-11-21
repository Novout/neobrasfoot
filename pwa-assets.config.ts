import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Gera os ícones do app instalável a partir de public/logo.svg: `npm run generate-pwa-assets`.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Fundo igual ao do logo nos ícones com margem (maskable e Apple).
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0d1712' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0d1712' } },
  },
  images: ['public/logo.svg'],
})
