import type { PenaltyKick, PenaltyScore, Player } from '../types/game'
import { playerSkills } from './skills'

/**
 * Pênaltis: cobrança a cobrança, o batedor contra o goleiro.
 * Usado nos pênaltis durante o jogo (falta na área) e na disputa que desempata a copa.
 */

/** Parte das faltas que acontece dentro da área e vira pênalti (~0,3 pênalti por jogo). */
export const PENALTY_FOUL_SHARE = 0.012
export const BASE_KICK_CONVERSION = 0.78

const TAKER_SKILL_BONUS: Record<string, number> = { 'cobrador-de-penaltis': 0.08, 'bola-parada': 0.05, finalizacao: 0.03 }
const KEEPER_SKILL_BONUS: Record<string, number> = { 'pegador-de-penaltis': 0.12, reflexos: 0.03 }

type Kicker = Pick<Player, 'id' | 'position' | 'skills' | 'overall' | 'energy'>
type Keeper = Pick<Player, 'id' | 'position' | 'skills' | 'overall'>

/** Chance de converter: qualidade e habilidades do batedor, cansaço, e o goleiro do outro lado. */
export function kickConversion(taker: Kicker, keeper?: Keeper | null) {
  let chance = BASE_KICK_CONVERSION + (taker.overall - 70) * 0.004
  for (const s of playerSkills(taker)) chance += TAKER_SKILL_BONUS[s] ?? 0
  if (taker.position === 'GOL') chance -= 0.15
  if (taker.energy < 40) chance -= 0.05
  if (!keeper) chance += 0.1 // sem goleiro de ofício no gol (expulso)
  else {
    chance -= (keeper.overall - 70) * 0.003
    for (const s of playerSkills(keeper)) chance -= KEEPER_SKILL_BONUS[s] ?? 0
    if (keeper.position !== 'GOL') chance += 0.1
  }
  return Math.max(0.45, Math.min(0.93, chance))
}

/** Goleiro em campo (ou quem foi para o gol, se o goleiro saiu). */
export function goalkeeperOf(onPitch: Keeper[]) {
  return onPitch.find((p) => p.position === 'GOL') ?? null
}

/** Batedores do melhor para o pior contra este goleiro. */
export function bestTakers<T extends Kicker>(onPitch: T[], keeper?: Keeper | null) {
  return [...onPitch].sort((a, b) => kickConversion(b, keeper) - kickConversion(a, keeper))
}

// --- Disputa de pênaltis ---

export interface ShootoutState {
  homeId: string
  awayId: string
  /** Quem começa cobrando (sorteio). */
  firstId: string
  kicks: PenaltyKick[]
}

export function shootoutScore(s: ShootoutState): PenaltyScore {
  return {
    home: s.kicks.filter((k) => k.teamId === s.homeId && k.scored).length,
    away: s.kicks.filter((k) => k.teamId === s.awayId && k.scored).length,
  }
}

/** Time que cobra agora (alternado, começando por `firstId`). */
export function nextKickingTeam(s: ShootoutState) {
  const second = s.firstId === s.homeId ? s.awayId : s.homeId
  return s.kicks.length % 2 === 0 ? s.firstId : second
}

/** 5 cobranças para cada lado (acaba antes se um não alcança mais o outro) e depois morte súbita. */
export function shootoutDecided(s: ShootoutState) {
  const { home, away } = shootoutScore(s)
  const homeKicks = s.kicks.filter((k) => k.teamId === s.homeId).length
  const awayKicks = s.kicks.filter((k) => k.teamId === s.awayId).length
  if (homeKicks <= 5 && awayKicks <= 5) {
    if (home + (5 - homeKicks) < away || away + (5 - awayKicks) < home) return true
    if (homeKicks < 5 || awayKicks < 5) return false
  }
  return homeKicks === awayKicks && home !== away
}

/** Batedores disponíveis: ninguém bate a segunda vez antes de todos do time terem batido. */
export function eligibleKickers<T extends Pick<Player, 'id'>>(s: ShootoutState, teamId: string, onPitch: T[]) {
  const taken = s.kicks.filter((k) => k.teamId === teamId).map((k) => k.playerId)
  const round = Math.floor(taken.length / Math.max(onPitch.length, 1))
  const thisRound = new Set(taken.slice(round * onPitch.length))
  return onPitch.filter((p) => !thisRound.has(p.id))
}

/** Uma cobrança da disputa. */
export function takeKick(s: ShootoutState, teamId: string, taker: Kicker & { name: string }, keeper: Keeper | null, roll = Math.random()) {
  const kick: PenaltyKick = { teamId, playerId: taker.id, playerName: taker.name, scored: roll < kickConversion(taker, keeper) }
  s.kicks.push(kick)
  return kick
}

/** Disputa inteira decidida pela IA: cada time manda os melhores batedores, na ordem. */
export function simulateShootout(
  homeId: string,
  awayId: string,
  home: (Kicker & { name: string })[],
  away: (Kicker & { name: string })[],
  random = Math.random,
): ShootoutState {
  const s: ShootoutState = { homeId, awayId, firstId: random() < 0.5 ? homeId : awayId, kicks: [] }
  const lineups: Record<string, (Kicker & { name: string })[]> = { [homeId]: home, [awayId]: away }
  while (!shootoutDecided(s) && s.kicks.length < 60) {
    const teamId = nextKickingTeam(s)
    const keeper = goalkeeperOf(teamId === homeId ? away : home)
    const taker = bestTakers(eligibleKickers(s, teamId, lineups[teamId]!), keeper)[0]
    if (!taker) break
    takeKick(s, teamId, taker, keeper, random())
  }
  return s
}
