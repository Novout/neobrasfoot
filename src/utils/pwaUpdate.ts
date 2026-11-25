import type { Pinia } from 'pinia'
import { watch } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { useMatchStore } from '../stores/match'

/** De quanto em quanto tempo o jogo aberto procura uma versão nova. */
const CHECK_EVERY_MS = 30 * 60 * 1000

/**
 * Atualização automática do PWA: quando a versão nova termina de baixar, o service worker novo assume e
 * a página recarrega sozinha (o save fica no localStorage, então nada se perde).
 * Com uma partida rodando ao vivo, espera o relógio parar (pausa, intervalo ou fim de jogo).
 */
export function setupAutoUpdate(pinia: Pinia) {
  const match = useMatchStore(pinia)
  let pending = false

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
      applyWhenSafe()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Jogo aberto por muito tempo (ou instalado): procura atualização de tempos em tempos e ao voltar para ele.
      setInterval(() => registration.update(), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    },
  })

  function applyWhenSafe() {
    if (!pending || match.running) return
    pending = false
    // Ativa o service worker novo e recarrega a página quando ele assumir.
    void updateSW(true)
  }

  // A partida parou (pausa, intervalo, pênalti ou fim): é a hora de atualizar, se houver versão nova.
  watch(
    () => match.running,
    (running) => {
      if (!running) applyWhenSafe()
    },
  )
}
