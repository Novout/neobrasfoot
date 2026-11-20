import { watch, type Ref } from 'vue'

const PREFIX = 'neobrasfoot:'

/**
 * Restaura os refs a partir do localStorage e salva automaticamente a cada mudança.
 * Incrementar `version` descarta saves antigos com formato incompatível.
 */
export function persistRefs(key: string, refs: Record<string, Ref>, version = 1) {
  const storageKey = PREFIX + key

  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const saved = JSON.parse(raw) as { version: number; data: Record<string, unknown> }
      if (saved.version === version) {
        for (const [name, value] of Object.entries(saved.data)) {
          if (name in refs) refs[name]!.value = value
        }
      } else {
        localStorage.removeItem(storageKey)
      }
    }
  } catch {
    localStorage.removeItem(storageKey)
  }

  watch(
    () => Object.fromEntries(Object.entries(refs).map(([name, r]) => [name, r.value])),
    (data) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version, data }))
      } catch (err) {
        console.warn('Não foi possível salvar o progresso:', err)
      }
    },
    { deep: true },
  )
}
