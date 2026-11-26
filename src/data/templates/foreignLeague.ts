import type { DivisionId, Team } from '../../types/game'
import { LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, teamsFromLeagueFile, type LeagueFileTeam } from '../leagueFile'
import { realSquadFrom, type RawPlayer } from './brasileirao'

/**
 * Ligas estrangeiras com clubes reais (La Liga, Premier League, Bundesliga): disputadas em paralelo às séries
 * brasileiras no formato 2×20, fora da pirâmide (ninguém sobe nem cai) e fora da Copa do Brasil e da Libertadores.
 * Sem escudos: o distintivo usa as cores do clube.
 *
 * Elencos, técnicos e estádios reais vêm do arquivo baixado da Wikipédia/Wikidata para cada liga
 * (`npm run update-laliga`, `update-premier`, `update-bundesliga`). Idade e OVR são calculados como no Brasileirão.
 */

export type ForeignClub = Required<Pick<LeagueFileTeam, 'id' | 'name' | 'shortName' | 'primaryColor' | 'secondaryColor' | 'reputation' | 'stadiumName'>>

/** Dados brutos baixados de uma liga: data, e técnico, estádio e jogadores de cada clube. */
export interface ForeignSquads {
  fetchedAt: string
  clubs: Record<string, { manager?: string; stadium?: string; players: RawPlayer[] }>
}

/**
 * Clubes de uma liga estrangeira, com elenco, técnico e estádio reais (nova cópia a cada chamada).
 * O estádio da ficha do clube na Wikipédia tem prioridade; `stadiumName` fica como reserva.
 */
export function foreignLeagueTeams(name: string, division: DivisionId, clubs: ForeignClub[], squads: ForeignSquads): Team[] {
  return teamsFromLeagueFile({
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    name,
    teams: clubs.map((t) => {
      const raw = squads.clubs[t.id]
      return {
        ...t,
        division,
        stadiumName: raw?.stadium ?? t.stadiumName,
        ...(raw?.manager ? { manager: raw.manager } : {}),
        players: realSquadFrom(raw?.players, t.id, t.reputation, squads.fetchedAt),
      }
    }),
  })
}
