import type { DivisionId } from '../types/game'

/** Da mais forte para a mais fraca. */
export const DIVISIONS: DivisionId[] = ['A', 'B', 'C', 'D']

export const DIVISION_LABELS: Record<DivisionId, string> = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
}

/** Quantos sobem e quantos descem por divisão ao fim da temporada. */
export const PROMOTION_SPOTS = 2
export const RELEGATION_SPOTS = 2
/** Ajuste de reputação ao subir ou cair de divisão. */
export const REPUTATION_SWING = 4

export const MIN_PLAYER_OVERALL = 30
export const MAX_PLAYER_OVERALL = 99

export function divisionAbove(division: DivisionId): DivisionId | null {
  return DIVISIONS[DIVISIONS.indexOf(division) - 1] ?? null
}

export function divisionBelow(division: DivisionId): DivisionId | null {
  return DIVISIONS[DIVISIONS.indexOf(division) + 1] ?? null
}

export type TableZone = 'champion' | 'promotion' | 'relegation' | null

/** Zona de uma posição (1 = líder) numa tabela de `size` times. */
export function tableZone(division: DivisionId, position: number, size: number): TableZone {
  if (position === 1 && division === 'A') return 'champion'
  if (divisionAbove(division) && position <= PROMOTION_SPOTS) return 'promotion'
  if (divisionBelow(division) && position > size - RELEGATION_SPOTS) return 'relegation'
  return null
}
