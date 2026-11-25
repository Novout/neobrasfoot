import type { Team } from '../../types/game'
import { LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, teamsFromLeagueFile, type LeagueFileTeam } from '../leagueFile'
import { realSquadFrom, type RawPlayer } from './brasileirao'
import squads from './laliga-squads.json'

/**
 * La Liga (1ª divisão espanhola), temporada 2026–27: disputada em paralelo às séries brasileiras no formato 2×20
 * (também 20 clubes e 38 rodadas). Fica fora da pirâmide (ninguém sobe nem cai) e fora da Copa do Brasil e da
 * Libertadores. Sem escudos: o distintivo usa as cores do clube.
 *
 * Elencos e técnicos reais: laliga-squads.json, baixado da Wikipédia/Wikidata por `npm run update-laliga`.
 * Idade e OVR são calculados como no Brasileirão (estimativas do jogo).
 */

type LaLigaTeam = Required<Pick<LeagueFileTeam, 'id' | 'name' | 'shortName' | 'primaryColor' | 'secondaryColor' | 'reputation' | 'stadiumName'>>

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
const TEAMS: LaLigaTeam[] = [
  { id: 'es-real-madrid', name: 'Real Madrid', shortName: 'RMA', primaryColor: '#ffffff', secondaryColor: '#00529f', reputation: 92, stadiumName: 'Santiago Bernabéu' },
  { id: 'es-barcelona', name: 'Barcelona', shortName: 'BAR', primaryColor: '#a50044', secondaryColor: '#004d98', reputation: 92, stadiumName: 'Spotify Camp Nou' },
  { id: 'es-atletico-madrid', name: 'Atlético de Madrid', shortName: 'ATM', primaryColor: '#cb3524', secondaryColor: '#ffffff', reputation: 87, stadiumName: 'Metropolitano' },
  { id: 'es-athletic', name: 'Athletic Bilbao', shortName: 'ATH', primaryColor: '#ee2523', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'San Mamés' },
  { id: 'es-villarreal', name: 'Villarreal', shortName: 'VIL', primaryColor: '#ffe667', secondaryColor: '#005187', reputation: 83, stadiumName: 'Estadio de la Cerámica' },
  { id: 'es-real-sociedad', name: 'Real Sociedad', shortName: 'RSO', primaryColor: '#0067b1', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'Reale Arena' },
  { id: 'es-betis', name: 'Real Betis', shortName: 'BET', primaryColor: '#00954c', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'Benito Villamarín' },
  { id: 'es-sevilla', name: 'Sevilla', shortName: 'SEV', primaryColor: '#d4021d', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Ramón Sánchez-Pizjuán' },
  { id: 'es-valencia', name: 'Valencia', shortName: 'VAL', primaryColor: '#ee3524', secondaryColor: '#111111', reputation: 78, stadiumName: 'Mestalla' },
  { id: 'es-celta', name: 'Celta de Vigo', shortName: 'CEL', primaryColor: '#8ac3ee', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Balaídos' },
  { id: 'es-osasuna', name: 'Osasuna', shortName: 'OSA', primaryColor: '#d91a21', secondaryColor: '#0a346f', reputation: 75, stadiumName: 'El Sadar' },
  { id: 'es-rayo', name: 'Rayo Vallecano', shortName: 'RAY', primaryColor: '#e53027', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Vallecas' },
  { id: 'es-getafe', name: 'Getafe', shortName: 'GET', primaryColor: '#005999', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Coliseum' },
  { id: 'es-espanyol', name: 'Espanyol', shortName: 'ESP', primaryColor: '#007fc8', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'RCDE Stadium' },
  { id: 'es-alaves', name: 'Alavés', shortName: 'ALA', primaryColor: '#0761af', secondaryColor: '#ffffff', reputation: 73, stadiumName: 'Mendizorrotza' },
  { id: 'es-deportivo', name: 'Deportivo La Coruña', shortName: 'DEP', primaryColor: '#004f9f', secondaryColor: '#ffffff', reputation: 72, stadiumName: 'Riazor' },
  { id: 'es-elche', name: 'Elche', shortName: 'ELC', primaryColor: '#05642c', secondaryColor: '#ffffff', reputation: 72, stadiumName: 'Martínez Valero' },
  { id: 'es-malaga', name: 'Málaga', shortName: 'MAL', primaryColor: '#3a8fd2', secondaryColor: '#ffffff', reputation: 71, stadiumName: 'La Rosaleda' },
  { id: 'es-racing', name: 'Racing Santander', shortName: 'RAC', primaryColor: '#00a650', secondaryColor: '#ffffff', reputation: 71, stadiumName: 'El Sardinero' },
  { id: 'es-levante', name: 'Levante', shortName: 'LEV', primaryColor: '#b4053f', secondaryColor: '#004a98', reputation: 71, stadiumName: 'Ciutat de València' },
]

export const LALIGA_NAME = 'La Liga'
/** Data dos elencos (as idades são calculadas nela). */
export const LALIGA_SQUADS_DATE: string = squads.fetchedAt
const RAW: Record<string, { manager?: string; players: RawPlayer[] }> = squads.clubs

/** Clubes da La Liga com elenco e técnico reais (nova cópia a cada chamada). */
export function laLigaTeams(): Team[] {
  return teamsFromLeagueFile({
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    name: LALIGA_NAME,
    teams: TEAMS.map((t) => ({
      ...t,
      division: 'ESP',
      ...(RAW[t.id]?.manager ? { manager: RAW[t.id]!.manager } : {}),
      players: realSquadFrom(RAW[t.id]?.players, t.id, t.reputation, LALIGA_SQUADS_DATE),
    })),
  })
}
