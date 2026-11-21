import type { PlayStyle } from '../types/game'

/**
 * Faltas e acréscimos. Cada partida tem os seus: o quarto árbitro anuncia aos 45' e aos 90'
 * quantos minutos serão jogados a mais, conforme o tempo perdido com faltas, cartões, lesões, gols e trocas.
 */

/** Chance de um time cometer falta a cada minuto (~12 por time no jogo). */
export const FOUL_CHANCE = 0.13
/** Times retrancados param mais o jogo com faltas; os ofensivos, menos. */
export const FOUL_STYLE_FACTOR: Record<PlayStyle, number> = { defensivo: 1.25, equilibrado: 1, ofensivo: 0.85 }

/** O que aconteceu num tempo de jogo e atrasou a partida. */
export interface HalfStoppages {
  fouls: number
  cards: number
  injuries: number
  goals: number
  subs: number
}

/** Minutos que cada tipo de parada costuma "custar". */
const LOST_MINUTES: HalfStoppages = { fouls: 0.12, cards: 0.5, injuries: 1, goals: 0.4, subs: 0.3 }
const LIMITS: Record<1 | 2, { min: number; max: number }> = { 1: { min: 1, max: 6 }, 2: { min: 2, max: 10 } }

/** Acréscimos de um tempo: base (1' no 1º tempo, 2' no 2º) + o tempo perdido, com um pouco de variação. */
export function addedTime(half: 1 | 2, s: HalfStoppages, roll = Math.random()) {
  const lost = (Object.keys(LOST_MINUTES) as (keyof HalfStoppages)[]).reduce((sum, k) => sum + s[k] * LOST_MINUTES[k], 0)
  const { min, max } = LIMITS[half]
  return Math.max(min, Math.min(max, Math.round(min + lost + (roll - 0.5))))
}

/** "45'", "45+2'", "90+4'". */
export function clockLabel(minute: number, extra?: number) {
  return extra ? `${minute}+${extra}'` : `${minute}'`
}
