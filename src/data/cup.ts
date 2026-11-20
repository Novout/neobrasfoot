import type { CupRound, CupState, CupTie, DivisionId, PenaltyScore, Team } from '../types/game'

export const CUP_NAME = 'Copa do Brasil'

/** Nome da fase pelo número de confrontos. */
const ROUND_NAMES: Record<number, string> = {
  16: '1ª fase',
  8: 'Oitavas de final',
  4: 'Quartas de final',
  2: 'Semifinal',
  1: 'Final',
}

/** Rodadas do campeonato jogadas antes de cada fase da Copa (jogos "de meio de semana"). */
export const CUP_SCHEDULE = [2, 5, 8, 11, 13]

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

const TOP_DIVISIONS: DivisionId[] = ['A', 'B']

/**
 * 1ª fase: um pote com as Séries A e B contra outro com C e D.
 * O time da divisão menor joga em casa, como nas primeiras fases da copa real.
 */
function drawFirstRound(teams: Team[]): CupRound {
  const strong = shuffle(teams.filter((t) => TOP_DIVISIONS.includes(t.division)))
  const weak = shuffle(teams.filter((t) => !TOP_DIVISIONS.includes(t.division)))
  const ties: CupTie[] = []
  while (strong.length && weak.length) ties.push(emptyTie(weak.pop()!.id, strong.pop()!.id))
  // Se os potes não tiverem o mesmo tamanho, as sobras se enfrentam entre si.
  const rest = shuffle([...strong, ...weak])
  for (let i = 0; i + 1 < rest.length; i += 2) ties.push(emptyTie(rest[i]!.id, rest[i + 1]!.id))
  return { name: roundName(ties.length), ties }
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
export function createCup(teams: Team[], season: number, playedLeagueRounds = 0): CupState {
  return {
    season,
    rounds: [drawFirstRound(teams)],
    currentRound: 0,
    schedule: CUP_SCHEDULE.map((r) => Math.max(r, playedLeagueRounds)),
    championId: null,
  }
}

/** Disputa de pênaltis: 5 cobranças alternadas e depois morte súbita. */
export function simulatePenalties(conversion = 0.75): PenaltyScore {
  const score = { home: 0, away: 0 }
  /** Encerra assim que um lado não consegue mais alcançar o outro com as cobranças restantes. */
  const decided = (homeLeft: number, awayLeft: number) =>
    score.home > score.away + awayLeft || score.away > score.home + homeLeft
  for (let kick = 0; kick < 5; kick++) {
    if (Math.random() < conversion) score.home++
    if (decided(4 - kick, 5 - kick)) return score
    if (Math.random() < conversion) score.away++
    if (decided(4 - kick, 4 - kick)) return score
  }
  while (score.home === score.away) {
    const home = Math.random() < conversion
    const away = Math.random() < conversion
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
