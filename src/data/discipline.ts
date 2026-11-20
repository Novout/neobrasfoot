import type { Player, Position } from '../types/game'

// --- Chances por minuto, por time ---

/** ~0,7 amarelo por time por jogo (~1,4 por partida). */
export const YELLOW_CHANCE = 0.008
/** Vermelho direto (~1 a cada 13 jogos por time); somado ao 2º amarelo dá ~0,1 vermelho por time. */
export const DIRECT_RED_CHANCE = 0.001
/** Lesão com o time descansado (~1 a cada 9 jogos por time); cresce com o cansaço. */
export const INJURY_BASE_CHANCE = 0.0012

/** Força que o time perde (ataque e defesa) por jogador expulso. */
export const SENT_OFF_PENALTY = 0.85

// --- Punições ---

export const YELLOWS_FOR_SUSPENSION = 3
export const SECOND_YELLOW_SUSPENSION = 1
export const DIRECT_RED_SUSPENSION = 2

/** Peso de cada posição no sorteio de quem leva cartão: defensores faltam mais. */
const CARD_WEIGHT: Record<Position, number> = { GOL: 0.3, DEF: 3, MEI: 2, ATA: 1 }

export function suspensionGames(p: Pick<Player, 'suspension'>) {
  return p.suspension ?? 0
}

export function injuryGames(p: Pick<Player, 'injury'>) {
  return p.injury ?? 0
}

/** Pode entrar em campo (não está suspenso nem lesionado). */
export function isAvailable(p: Pick<Player, 'suspension' | 'injury'>) {
  return suspensionGames(p) === 0 && injuryGames(p) === 0
}

/** Ex.: "Lesionado (3 jogos)" ou "Suspenso (1 jogo)"; null se disponível. */
export function unavailableReason(p: Pick<Player, 'suspension' | 'injury'>) {
  const games = (n: number) => `${n} jogo${n > 1 ? 's' : ''}`
  if (injuryGames(p) > 0) return `Lesionado (${games(injuryGames(p))})`
  if (suspensionGames(p) > 0) return `Suspenso (${games(suspensionGames(p))})`
  return null
}

/** Cansaço aumenta o risco: com 50 de energia a chance dobra; com 0, triplica. */
export function injuryChanceFor(energy: number) {
  return INJURY_BASE_CHANCE * (1 + (100 - energy) / 50)
}

/** Duração da lesão: a maioria curta, poucas longas (1 a 6 jogos). */
export function rollInjuryGames(roll = Math.random()) {
  if (roll < 0.45) return 1
  if (roll < 0.75) return 2
  if (roll < 0.9) return 3
  if (roll < 0.97) return 4
  return 5 + Math.round(Math.random())
}

function weightedPick<T>(items: T[], weight: (item: T) => number): T | undefined {
  const total = items.reduce((sum, i) => sum + weight(i), 0)
  if (total <= 0) return items[0]
  let roll = Math.random() * total
  for (const item of items) {
    roll -= weight(item)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

/** Quem já tem amarelo joga com mais cuidado: chance menor de levar o segundo. */
export const BOOKED_CAUTION = 0.18

export function pickCardedPlayer(onPitch: Player[], booked: Set<string> = new Set()) {
  return weightedPick(onPitch, (p) => CARD_WEIGHT[p.position] * (booked.has(p.id) ? BOOKED_CAUTION : 1))
}

/** Quem se machuca: jogadores mais cansados têm mais chance. */
export function pickInjuredPlayer(onPitch: Player[]) {
  return weightedPick(onPitch, (p) => 1 + (100 - p.energy) / 50)
}
