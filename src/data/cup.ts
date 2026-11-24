import type { CupRound, CupState, CupTie, PenaltyScore, Team } from '../types/game'
import { ALL_DIVISIONS } from './divisions'

export const CUP_NAME = 'Copa do Brasil'

/** Nome da fase pelo número de confrontos. */
const ROUND_NAMES: Record<number, string> = {
  16: '1ª fase',
  8: 'Oitavas de final',
  4: 'Quartas de final',
  2: 'Semifinal',
  1: 'Final',
}

/** Rodadas do campeonato jogadas antes de cada fase da Copa (jogos "de meio de semana"), num campeonato de 14 rodadas. */
export const CUP_SCHEDULE = [2, 5, 8, 11, 13]
/** Rodadas do campeonato para as quais CUP_SCHEDULE foi pensado (Séries de 8 clubes). */
const BASE_LEAGUE_ROUNDS = 14
/** Clubes no mata-mata principal (1ª fase): 32, em 5 fases. Com mais clubes, os mais fracos jogam uma fase preliminar. */
export const CUP_TEAMS = 32
export const PRELIMINARY_NAME = 'Fase preliminar'
/** Prêmio por vencer a fase preliminar. */
export const PRELIMINARY_PRIZE = 150_000

/**
 * Calendário da Copa espalhado proporcionalmente num campeonato de `leagueRounds` rodadas.
 * Com fase preliminar, ela vem antes da 1ª fase, na metade do caminho até ela.
 */
export function cupSchedule(leagueRounds = BASE_LEAGUE_ROUNDS, preliminary = false) {
  const main = CUP_SCHEDULE.map((r) => Math.max(1, Math.min(leagueRounds - 1, Math.round((r * leagueRounds) / BASE_LEAGUE_ROUNDS))))
  return preliminary ? [Math.max(1, Math.floor(main[0]! / 2)), ...main] : main
}

/** Todos os clubes da liga disputam a Copa: ordenados do mais forte (série, depois reputação) ao mais fraco. */
export function cupParticipants(teams: Team[]): Team[] {
  return [...teams].sort(
    (a, b) => ALL_DIVISIONS.indexOf(a.division) - ALL_DIVISIONS.indexOf(b.division) || b.reputation - a.reputation,
  )
}

export function hasPreliminary(c: Pick<CupState, 'byes'>) {
  return !!c.byes?.length
}

/** Prêmio por vencer a fase `index` (a última é o título). */
export function cupPrize(c: Pick<CupState, 'byes'>, index: number) {
  if (!hasPreliminary(c)) return CUP_PRIZES[index] ?? 0
  return index === 0 ? PRELIMINARY_PRIZE : (CUP_PRIZES[index - 1] ?? 0)
}

/** Nome e número de confrontos de cada fase da Copa (sorteadas ou não), na ordem. */
export function cupPhases(c: Pick<CupState, 'byes' | 'rounds'>) {
  const prelim = hasPreliminary(c)
  const main = [16, 8, 4, 2, 1].map((ties) => ({ name: roundName(ties), ties }))
  const phases = prelim ? [{ name: PRELIMINARY_NAME, ties: c.rounds[0]?.ties.length ?? 8 }, ...main] : main
  return phases.map((p, i) => ({ ...p, name: c.rounds[i]?.name ?? p.name }))
}

/** Premiação por vencer um confronto em cada fase (o último valor é o prêmio do título). */
export const CUP_PRIZES = [300_000, 500_000, 800_000, 1_200_000, 3_000_000]
/** Prêmio do vice-campeão. */
export const CUP_RUNNER_UP_PRIZE = 1_500_000

export function roundName(tieCount: number) {
  return ROUND_NAMES[tieCount] ?? `Fase de ${tieCount * 2}`
}

/** "na 1ª fase", "nas oitavas de final", "na final"... para usar em frases. */
export function inRound(name: string) {
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  return /^(oitavas|quartas)/i.test(name) ? `nas ${lower}` : `na ${lower}`
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

function emptyTie(homeId: string, awayId: string): CupTie {
  return { homeId, awayId, homeGoals: null, awayGoals: null, penalties: null, winnerId: null }
}

/**
 * 1ª fase: um pote com a metade mais forte (no 4×8, as Séries A e B) contra outro com a mais fraca.
 * O time mais fraco joga em casa, como nas primeiras fases da copa real.
 */
function drawFirstRound(participants: Team[]): CupRound {
  const half = Math.floor(participants.length / 2)
  const strong = shuffle(participants.slice(0, half))
  const weak = shuffle(participants.slice(half))
  const ties: CupTie[] = []
  while (strong.length && weak.length) ties.push(emptyTie(weak.pop()!.id, strong.pop()!.id))
  // Se os potes não tiverem o mesmo tamanho, as sobras se enfrentam entre si.
  const rest = shuffle([...strong, ...weak])
  for (let i = 0; i + 1 < rest.length; i += 2) ties.push(emptyTie(rest[i]!.id, rest[i + 1]!.id))
  return { name: roundName(ties.length), ties }
}

/**
 * Próxima fase depois dos resultados: após a fase preliminar, os vencedores se juntam aos clubes que
 * entraram direto, com o mesmo sorteio por potes da 1ª fase. Depois, sorteio livre.
 */
export function nextCupRound(c: Pick<CupState, 'byes' | 'currentRound'>, winnerIds: string[], teams: Team[]): CupRound {
  if (hasPreliminary(c) && c.currentRound === 0) {
    const ids = new Set([...c.byes!, ...winnerIds])
    return drawFirstRound(cupParticipants(teams.filter((t) => ids.has(t.id))))
  }
  return drawNextRound(winnerIds)
}

/** Sorteio livre das fases seguintes, com mando também sorteado. */
export function drawNextRound(winnerIds: string[]): CupRound {
  const pool = shuffle(winnerIds)
  const ties: CupTie[] = []
  for (let i = 0; i + 1 < pool.length; i += 2) ties.push(emptyTie(pool[i]!, pool[i + 1]!))
  return { name: roundName(ties.length), ties }
}

/**
 * Cria a Copa da temporada. `playedLeagueRounds` empurra o calendário quando a copa
 * começa com o campeonato já em andamento (ex.: saves antigos).
 */
export function createCup(teams: Team[], season: number, playedLeagueRounds = 0, leagueRounds = BASE_LEAGUE_ROUNDS): CupState {
  const ranked = cupParticipants(teams)
  // Mais de 32 clubes (2×20): os mais fracos jogam a fase preliminar para sobrarem exatamente 32.
  const extra = Math.max(0, ranked.length - CUP_TEAMS)
  const byes = extra ? ranked.slice(0, ranked.length - extra * 2) : []
  const first = extra ? { name: PRELIMINARY_NAME, ties: drawFirstRound(ranked.slice(-extra * 2)).ties } : drawFirstRound(ranked)
  return {
    season,
    rounds: [first],
    currentRound: 0,
    schedule: cupSchedule(leagueRounds, extra > 0).map((r) => Math.max(r, playedLeagueRounds)),
    championId: null,
    ...(byes.length ? { byes: byes.map((t) => t.id) } : {}),
  }
}

/** Disputa de pênaltis: 5 cobranças alternadas e depois morte súbita. */
export function simulatePenalties(homeConversion = 0.75, awayConversion = homeConversion): PenaltyScore {
  const score = { home: 0, away: 0 }
  /** Encerra assim que um lado não consegue mais alcançar o outro com as cobranças restantes. */
  const decided = (homeLeft: number, awayLeft: number) =>
    score.home > score.away + awayLeft || score.away > score.home + homeLeft
  for (let kick = 0; kick < 5; kick++) {
    if (Math.random() < homeConversion) score.home++
    if (decided(4 - kick, 5 - kick)) return score
    if (Math.random() < awayConversion) score.away++
    if (decided(4 - kick, 4 - kick)) return score
  }
  while (score.home === score.away) {
    const home = Math.random() < homeConversion
    const away = Math.random() < awayConversion
    score.home += Number(home)
    score.away += Number(away)
  }
  return score
}

export function tieWinner(homeId: string, awayId: string, homeGoals: number, awayGoals: number, penalties: PenaltyScore | null) {
  if (homeGoals !== awayGoals) return homeGoals > awayGoals ? homeId : awayId
  if (!penalties) return null
  return penalties.home > penalties.away ? homeId : awayId
}
