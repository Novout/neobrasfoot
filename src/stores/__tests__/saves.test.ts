import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createTeams } from '../../data/teams'
import { prepareNewCareer } from '../../utils/saveSlots'
import {
  activeSaveId, createSave, DEFAULT_SLOT, deleteSave, duplicateSave, readSaveIndex, renameSave, resetSaveIndexCache, setSaveMode, storageKeyFor,
  switchSave,
} from '../../utils/storage'
import { useGameStore } from '../game'
import { useMatchStore } from '../match'

/** Simula abrir o jogo de novo (stores e índice lidos do localStorage). */
function reopen() {
  resetSaveIndexCache()
  setActivePinia(createPinia())
  return { game: useGameStore(), match: useMatchStore() }
}

const savedClub = (slot: string) => {
  const raw = localStorage.getItem(storageKeyFor('career', slot))
  return raw ? (JSON.parse(raw).data.managedTeamId as string | null) : null
}

describe('saves', () => {
  it('save único é o padrão e usa as mesmas chaves de sempre', () => {
    expect(readSaveIndex().mode).toBe('single')
    expect(activeSaveId()).toBe(DEFAULT_SLOT)
    expect(storageKeyFor('career')).toBe('neobrasfoot:career')
    expect(storageKeyFor('round')).toBe('neobrasfoot:round')
  })

  it('save único: começar outra carreira pede confirmação e substitui a atual', async () => {
    const [a, b] = createTeams()
    const { game, match } = reopen()
    game.startCareer(a!.id, 'Técnico')
    await nextTick()
    vi.stubGlobal('confirm', () => false)
    expect(prepareNewCareer(game, match)).toBe(false)
    vi.stubGlobal('confirm', () => true)
    expect(prepareNewCareer(game, match)).toBe(true)
    game.startCareer(b!.id, 'Técnico')
    await nextTick()
    expect(readSaveIndex().slots).toHaveLength(1)
    expect(savedClub(DEFAULT_SLOT)).toBe(b!.id)
    vi.unstubAllGlobals()
  })

  it('vários saves: a carreira nova vai para um save novo e a antiga continua guardada', async () => {
    const [a, b] = createTeams()
    let { game, match } = reopen()
    game.startCareer(a!.id, 'Técnico A')
    await nextTick()
    setSaveMode('multi')

    expect(prepareNewCareer(game, match)).toBe(true)
    const second = activeSaveId()
    expect(second).not.toBe(DEFAULT_SLOT)
    game.startCareer(b!.id, 'Técnico B')
    await nextTick()

    expect(savedClub(DEFAULT_SLOT)).toBe(a!.id)
    expect(savedClub(second)).toBe(b!.id)
    // Cada save tem o seu resumo na lista.
    const slots = readSaveIndex().slots
    expect(slots.find((s) => s.id === DEFAULT_SLOT)!.summary!.club).toBe(a!.name)
    expect(slots.find((s) => s.id === second)!.summary!.club).toBe(b!.name)

    // Carregar o primeiro save de novo (como o botão Carregar, que recarrega o jogo).
    switchSave(DEFAULT_SLOT)
    ;({ game } = reopen())
    expect(game.managedTeamId).toBe(a!.id)
    expect(game.managerName).toBe('Técnico A')
    switchSave(second)
    ;({ game } = reopen())
    expect(game.managedTeamId).toBe(b!.id)
  })

  it('renomear e apagar saves; apagar o save em uso passa para outro', () => {
    setSaveMode('multi')
    const id = createSave('Teste')
    renameSave(id, '  Carreira no Flamengo  ')
    expect(readSaveIndex().slots.find((s) => s.id === id)!.name).toBe('Carreira no Flamengo')
    localStorage.setItem(storageKeyFor('career', id), '{}')
    switchSave(id)
    deleteSave(id)
    expect(localStorage.getItem(storageKeyFor('career', id))).toBeNull()
    expect(readSaveIndex().slots.some((s) => s.id === id)).toBe(false)
    expect(activeSaveId()).toBe(DEFAULT_SLOT)
    // Apagar o último save recria o principal vazio.
    deleteSave(DEFAULT_SLOT)
    expect(readSaveIndex().slots.map((s) => s.id)).toEqual([DEFAULT_SLOT])
  })

  it('a escolha de liga e outras preferências não são por save', () => {
    setSaveMode('multi')
    switchSave(createSave())
    expect(storageKeyFor('editor-liga')).toBe('neobrasfoot:editor-liga')
    expect(storageKeyFor('team-builder')).toBe('neobrasfoot:team-builder')
  })

  it('salvar cópia: guarda o momento num save novo e o jogo continua no save atual', async () => {
    const [a] = createTeams()
    let { game } = reopen()
    game.startCareer(a!.id, 'Técnico')
    await nextTick()
    setSaveMode('multi')
    const copy = duplicateSave(undefined, 'Antes da final')
    expect(activeSaveId()).toBe(DEFAULT_SLOT)
    const slot = readSaveIndex().slots.find((s) => s.id === copy)!
    expect(slot.name).toBe('Antes da final')
    expect(slot.summary!.club).toBe(a!.name)

    // Segue jogando no save atual: a cópia não muda.
    game.budget = 1
    await nextTick()
    expect(JSON.parse(localStorage.getItem(storageKeyFor('career', copy))!).data.budget).not.toBe(1)
    // Carregar a cópia traz o momento salvo.
    switchSave(copy)
    ;({ game } = reopen())
    expect(game.managedTeamId).toBe(a!.id)
    expect(game.budget).not.toBe(1)
  })
})
