import { ref } from 'vue'

/**
 * Instalação do jogo como app (PWA). O navegador (Chrome/Edge) avisa com `beforeinstallprompt`
 * quando o site pode ser instalado; guardamos o evento para abrir o diálogo pelo nosso botão.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

/** O navegador permite instalar agora (mostra o botão "Instalar"). */
export const canInstall = ref(false)
/** Aberto como app instalado (janela própria, sem barra do navegador). */
export const isInstalledApp = ref(
  typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
)

/** Chamado uma vez no início (main.ts): o evento pode chegar antes de qualquer tela montar. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // sem o mini-aviso automático do navegador; usamos o nosso botão
    deferredPrompt = e as BeforeInstallPromptEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
  })
}

/** Abre o diálogo de instalação do navegador. Retorna true se o jogador aceitou. */
export async function promptInstall() {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  canInstall.value = false
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome === 'accepted'
}
