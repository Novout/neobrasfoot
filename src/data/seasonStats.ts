import type { DivisionId, LiveMatch, Player, Position } from '../types/game'

/**
 * Estatísticas de cada jogador no campeonato da temporada (a Copa não entra) e a seleção de cada série:
 * 1 goleiro, 4 defensores, 4 meias e 2 atacantes, pela média de nota nos jogos.
 */

export interface PlayerSeasonStats {
  playerId: string
  name: string
  position: Position
  teamId: string
  division: DivisionId
  overall: number
  star?: boolean
  apps: number
  goals: number
  /** Jogos sem sofrer gol (vale para goleiros e defensores). */
  cleanSheets: number
  yellow: number
  red: number
  /** Soma das notas dos jogos (a média é ratingSum / apps). */
  ratingSum: number
}

/** Formação da seleção da temporada. */
export const BEST_XI_SHAPE: Record<Position, number> = { GOL: 1, DEF: 4, MEI: 4, ATA: 2 }
/** Fração mínima das rodadas jogadas para entrar na seleção (vale a regularidade, não um jogo bom). */
export const MIN_APPS_SHARE = 0.4

export interface BestXIEntry {
  playerId: string
  name: string
  position: Position
  teamId: string
  apps: number
  goals: number
  cleanSheets: number
  rating: number
  star?: boolean
}

export interface BestXIRecord {
  season: number
  year: number
  divisions: Partial<Record<DivisionId, BestXIEntry[]>>
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/**
 * Nota de um jogador numa partida (de 3 a 10, base 6): resultado do time, gols, jogos sem sofrer gol
 * (goleiro e defesa), gols sofridos, cartões e um pouco da qualidade do jogador.
 */
export function matchRating(input: {
  position: Position
  overall: number
  result: number
  goals: number
  conceded: number
  yellow: number
  red: number
}) {
  const { position, overall, result, goals, conceded, yellow, red } = input
  let rating = 6 + (result > 0 ? 0.5 : result < 0 ? -0.4 : 0) + goals * 1.1 + (overall - 70) * 0.03
  if (position === 'GOL' || position === 'DEF') {
    rating += conceded === 0 ? (position === 'GOL' ? 1.1 : 0.6) : -Math.min(1.2, conceded * (position === 'GOL' ? 0.3 : 0.2))
  }
  rating -= yellow * 0.3 + red * 1.5
  return clamp(rating, 3, 10)
}

/**
 * Soma uma partida do campeonato às estatísticas. `played` = jogadores de cada time que entraram em campo.
 */
export function recordMatch(
  stats: Record<string, PlayerSeasonStats>,
  m: LiveMatch,
  played: Record<string, Player[]>,
  divisionOf: (teamId: string) => DivisionId,
) {
  for (const [teamId, goalsFor, goalsAgainst] of [
    [m.homeId, m.homeGoals, m.awayGoals],
    [m.awayId, m.awayGoals, m.homeGoals],
  ] as const) {
    const result = Math.sign(goalsFor - goalsAgainst)
    for (const p of played[teamId] ?? []) {
      const count = (type: string) => m.events.filter((e) => e.type === type && e.teamId === teamId && e.playerId === p.id).length
      const goals = count('gol')
      const yellow = count('amarelo')
      const red = count('vermelho')
      const entry = (stats[p.id] ??= {
        playerId: p.id,
        name: p.name,
        position: p.position,
        teamId,
        division: divisionOf(teamId),
        overall: p.overall,
        star: p.star,
        apps: 0,
        goals: 0,
        cleanSheets: 0,
        yellow: 0,
        red: 0,
        ratingSum: 0,
      })
      // Clube e série atuais (transferido no meio da temporada conta onde está jogando).
      entry.teamId = teamId
      entry.division = divisionOf(teamId)
      entry.name = p.name
      entry.overall = p.overall
      entry.apps++
      entry.goals += goals
      entry.yellow += yellow
      entry.red += red
      if (goalsAgainst === 0 && (p.position === 'GOL' || p.position === 'DEF')) entry.cleanSheets++
      entry.ratingSum += matchRating({ position: p.position, overall: p.overall, result, goals, conceded: goalsAgainst, yellow, red })
    }
  }
}

export function averageRating(s: Pick<PlayerSeasonStats, 'ratingSum' | 'apps'>) {
  return s.apps ? s.ratingSum / s.apps : 0
}

/**
 * Seleção de uma série: os de melhor média em cada posição, com pelo menos MIN_APPS_SHARE das rodadas jogadas.
 * Desempate: mais gols, mais jogos sem sofrer gol, mais jogos.
 */
export function bestEleven(stats: Record<string, PlayerSeasonStats>, division: DivisionId, roundsPlayed: number): BestXIEntry[] {
  const minApps = Math.max(1, Math.ceil(roundsPlayed * MIN_APPS_SHARE))
  const pool = Object.values(stats).filter((s) => s.division === division && s.apps >= minApps)
  const result: BestXIEntry[] = []
  for (const position of Object.keys(BEST_XI_SHAPE) as Position[]) {
    pool
      .filter((s) => s.position === position)
      .sort(
        (a, b) =>
          averageRating(b) - averageRating(a) || b.goals - a.goals || b.cleanSheets - a.cleanSheets || b.apps - a.apps,
      )
      .slice(0, BEST_XI_SHAPE[position])
      .forEach((s) =>
        result.push({
          playerId: s.playerId,
          name: s.name,
          position,
          teamId: s.teamId,
          apps: s.apps,
          goals: s.goals,
          cleanSheets: s.cleanSheets,
          rating: Math.round(averageRating(s) * 100) / 100,
          ...(s.star ? { star: true } : {}),
        }),
      )
  }
  return result
}
