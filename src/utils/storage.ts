import { ref, watch, type Ref } from 'vue'

const PREFIX = 'neobrasfoot:'

// --- Saves (um ou vários) ---

/**
 * Dados que pertencem a um save: a carreira e a rodada em andamento. O resto (liga escolhida, editor,
 * rascunho do clube criado, som) é do jogo e vale para todos os saves.
 */
const SLOTTED_KEYS = new Set(['career', 'round'])
const INDEX_KEY = PREFIX + 'saves'

/** O save original: usa as mesmas chaves de antes, então quem já jogava não perde nada. */
export const DEFAULT_SLOT = 'principal'

export type SaveMode = 'single' | 'multi'

export interface SaveSummary {
  club: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  crest?: string
  manager: string
  season: number
  /** Ex.: "Série A · Rodada 5". */
  label: string
}

export interface SaveSlot {
  id: string
  name: string
  createdAt: string
  updatedAt?: string
  /** Resumo da carreira (ausente num save vazio). */
  summary?: SaveSummary | null
}

export interface SaveIndex {
  /** "single": um save só, como sempre foi; "multi": lista de saves para escolher. */
  mode: SaveMode
  active: string
  slots: SaveSlot[]
}

function defaultIndex(): SaveIndex {
  return {
    mode: 'single',
    active: DEFAULT_SLOT,
    slots: [{ id: DEFAULT_SLOT, name: 'Save principal', createdAt: new Date().toISOString() }],
  }
}

let index: SaveIndex | null = null

/** Índice dos saves (lido uma vez e mantido em memória). */
export function readSaveIndex(): SaveIndex {
  if (index) return index
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed = raw ? (JSON.parse(raw) as SaveIndex) : null
    index = parsed?.slots?.length && parsed.slots.some((s) => s.id === parsed.active) ? parsed : defaultIndex()
  } catch {
    index = defaultIndex()
  }
  return index
}

function writeSaveIndex() {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(readSaveIndex()))
  } catch (err) {
    console.warn('Não foi possível salvar a lista de saves:', err)
  }
}

/** Esquece o índice em memória (testes e troca de save com recarga). */
export function resetSaveIndexCache() {
  index = null
}

export function activeSaveId() {
  return readSaveIndex().active
}

/** Chave no localStorage de um dado, no save indicado (por padrão, o save em uso). */
export function storageKeyFor(key: string, slot = activeSaveId()) {
  return PREFIX + key + (SLOTTED_KEYS.has(key) && slot !== DEFAULT_SLOT ? `@${slot}` : '')
}

export function setSaveMode(mode: SaveMode) {
  readSaveIndex().mode = mode
  writeSaveIndex()
}

/** Cria um save vazio e devolve o id. Não troca o save em uso. */
export function createSave(name?: string): string {
  const idx = readSaveIndex()
  const id = `save-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  idx.slots.push({ id, name: name?.trim() || `Save ${idx.slots.length + 1}`, createdAt: new Date().toISOString() })
  writeSaveIndex()
  return id
}

export function renameSave(id: string, name: string) {
  const slot = readSaveIndex().slots.find((s) => s.id === id)
  if (!slot || !name.trim()) return
  slot.name = name.trim().slice(0, 40)
  writeSaveIndex()
}

/**
 * Passa a usar outro save. Os dados já carregados na tela continuam os do save anterior: para abrir um
 * save existente, recarregue a página depois; para começar uma carreira nova nele, basta iniciá-la.
 */
export function switchSave(id: string) {
  const idx = readSaveIndex()
  if (!idx.slots.some((s) => s.id === id)) return
  idx.active = id
  writeSaveIndex()
}

/** Apaga um save e os dados dele. Se for o save em uso, passa para outro (ou recria o principal). */
export function deleteSave(id: string) {
  const idx = readSaveIndex()
  for (const key of SLOTTED_KEYS) localStorage.removeItem(storageKeyFor(key, id))
  idx.slots = idx.slots.filter((s) => s.id !== id)
  if (!idx.slots.length) idx.slots = defaultIndex().slots
  if (!idx.slots.some((s) => s.id === idx.active)) idx.active = idx.slots[0]!.id
  writeSaveIndex()
}

/**
 * Copia um save inteiro (carreira e rodada em andamento) para um save novo: um "ponto de salvamento" para
 * voltar depois. O save em uso continua o mesmo. Retorna o id da cópia, ou lança erro se faltar espaço.
 */
export function duplicateSave(fromId = activeSaveId(), name?: string): string {
  const idx = readSaveIndex()
  const source = idx.slots.find((s) => s.id === fromId)
  if (!source) throw new Error('Save não encontrado.')
  const id = createSave(name)
  try {
    for (const key of SLOTTED_KEYS) {
      const raw = localStorage.getItem(storageKeyFor(key, fromId))
      if (raw !== null) localStorage.setItem(storageKeyFor(key, id), raw)
    }
  } catch {
    deleteSave(id)
    throw new Error('Não há espaço no navegador para mais um save. Apague um save antigo.')
  }
  const copy = idx.slots.find((s) => s.id === id)!
  copy.summary = source.summary ? { ...source.summary } : null
  copy.updatedAt = new Date().toISOString()
  writeSaveIndex()
  return id
}

/** Atualiza o resumo mostrado na lista de saves (clube, temporada, rodada). */
export function updateSaveSummary(summary: SaveSummary | null, id = activeSaveId()) {
  const slot = readSaveIndex().slots.find((s) => s.id === id)
  if (!slot) return
  if (JSON.stringify(slot.summary ?? null) === JSON.stringify(summary)) return
  slot.summary = summary
  slot.updatedAt = new Date().toISOString()
  writeSaveIndex()
}

/** Espaço aproximado que um save ocupa no navegador, em bytes. */
export function saveSize(id: string) {
  let chars = 0
  for (const key of SLOTTED_KEYS) chars += localStorage.getItem(storageKeyFor(key, id))?.length ?? 0
  return chars * 2
}

/** Espaço usado por todos os saves, em bytes. */
export function totalSavesSize() {
  return readSaveIndex().slots.reduce((sum, s) => sum + saveSize(s.id), 0)
}

/** Fica true se o navegador recusar uma gravação (espaço cheio): a tela avisa para apagar saves antigos. */
export const storageFull = ref(false)

// --- Persistência dos refs ---

/**
 * Restaura os refs a partir do localStorage e salva automaticamente a cada mudança.
 * Incrementar `version` descarta saves antigos com formato incompatível.
 * Dados de carreira vão para o save em uso (a chave é resolvida a cada gravação).
 */
export function persistRefs(key: string, refs: Record<string, Ref>, version = 1) {
  const storageKey = storageKeyFor(key)

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
        localStorage.setItem(storageKeyFor(key), JSON.stringify({ version, data }))
        storageFull.value = false
      } catch (err) {
        storageFull.value = true
        console.warn('Não foi possível salvar o progresso:', err)
      }
    },
    { deep: true },
  )
}
