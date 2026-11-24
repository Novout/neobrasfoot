import { createSave, readSaveIndex, switchSave } from './storage'

/**
 * Antes de começar uma carreira nova. Com um save só, pede confirmação para substituir a carreira atual.
 * Com vários saves, a carreira atual fica guardada e a nova vai para um save novo.
 * Retorna false se o jogador desistiu.
 */
export function prepareNewCareer(game: { hasCareer: boolean; managedTeam: { name: string } | null }, match: { reset: () => void }) {
  if (game.hasCareer) {
    if (readSaveIndex().mode === 'multi') {
      // Troca de save sem recarregar: o que for gravado a partir daqui vai para o save novo.
      switchSave(createSave())
    } else if (!confirm(`Isso substitui a carreira atual com o ${game.managedTeam?.name}. Continuar?`)) {
      return false
    }
  }
  match.reset()
  return true
}
