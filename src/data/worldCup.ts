import type { LibertadoresState, Team } from '../types/game'
import { LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, teamsFromLeagueFile, type LeagueFileTeam } from './leagueFile'
import { drawGroups, groupRoundsFor, stageSchedule, type DrawRule } from './libertadores'
import { realSquadFrom, type RawPlayer } from './templates/brasileirao'
import squads from './templates/selecoes-squads.json'
import { NATIONAL_CRESTS } from './crests'

/**
 * Copa do Mundo: 32 seleções reais, a cada 4 anos (2030, 2034...), no meio do ano (junho e julho).
 * Fase de grupos em turno único (8 grupos de 4, passam 2) e mata-mata em jogo único até a final.
 * Usa o mesmo motor de grupos e mata-mata da Libertadores; o estado tem o mesmo formato.
 *
 * Elencos e técnicos reais (convocados, com o número da camisa): selecoes-squads.json, baixado da
 * Wikipédia/Wikidata por `npm run update-selecoes`. Escudos das federações: public/escudos/<id>.png
 * (`npm run update-escudos-selecoes`).
 */

export const WORLD_CUP_NAME = 'Copa do Mundo'
/** Rodadas da fase de grupos (turno único entre 4 seleções). */
export const WORLD_CUP_GROUP_ROUNDS = 3
/** Etapas: 3 rodadas de grupos + oitavas, quartas, semifinal e final. */
export const WORLD_CUP_STAGES = WORLD_CUP_GROUP_ROUNDS + 4
/** Momento de cada etapa na temporada (fração do campeonato): de meados de junho a meados de julho. */
const STAGE_TIMING = [0.3, 0.32, 0.34, 0.37, 0.39, 0.41, 0.43]

/** A Copa acontece nos anos em que o ano dividido por 4 deixa resto 2 (2026, 2030, 2034...). */
export function isWorldCupYear(year: number) {
  return year % 4 === 2
}

/** Próximo ano de Copa a partir de `year` (inclusive). */
export function nextWorldCupYear(year: number) {
  let y = year
  while (!isWorldCupYear(y)) y++
  return y
}

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC'

export const CONFEDERATION_LABELS: Record<Confederation, string> = {
  UEFA: 'Europa', CONMEBOL: 'América do Sul', CONCACAF: 'América do Norte e Central', CAF: 'África', AFC: 'Ásia',
}

type NationSeed = Pick<LeagueFileTeam, 'id' | 'name' | 'shortName' | 'primaryColor' | 'secondaryColor' | 'reputation' | 'stadiumName'> & {
  id: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  reputation: number
  stadiumName: string
  /** Código do país (o mesmo das etiquetas de país). */
  country: string
  confederation: Confederation
}

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
export const NATIONS: NationSeed[] = [
  { id: 'nt-argentina', name: 'Argentina', shortName: 'ARG', country: 'ARG', confederation: 'CONMEBOL', primaryColor: '#75aadb', secondaryColor: '#ffffff', reputation: 94, stadiumName: 'Monumental de Núñez' },
  { id: 'nt-france', name: 'França', shortName: 'FRA', country: 'FRA', confederation: 'UEFA', primaryColor: '#1e3a8a', secondaryColor: '#ffffff', reputation: 94, stadiumName: 'Stade de France' },
  { id: 'nt-spain', name: 'Espanha', shortName: 'ESP', country: 'ESP', confederation: 'UEFA', primaryColor: '#c60b1e', secondaryColor: '#ffc400', reputation: 94, stadiumName: 'Santiago Bernabéu' },
  { id: 'nt-england', name: 'Inglaterra', shortName: 'ENG', country: 'ENG', confederation: 'UEFA', primaryColor: '#ffffff', secondaryColor: '#1e3a8a', reputation: 92, stadiumName: 'Wembley' },
  { id: 'nt-brazil', name: 'Brasil', shortName: 'BRA', country: 'BRA', confederation: 'CONMEBOL', primaryColor: '#ffdc02', secondaryColor: '#009739', reputation: 92, stadiumName: 'Maracanã' },
  { id: 'nt-portugal', name: 'Portugal', shortName: 'POR', country: 'POR', confederation: 'UEFA', primaryColor: '#c8102e', secondaryColor: '#046a38', reputation: 91, stadiumName: 'Estádio da Luz' },
  { id: 'nt-netherlands', name: 'Holanda', shortName: 'NED', country: 'NED', confederation: 'UEFA', primaryColor: '#f36c21', secondaryColor: '#111111', reputation: 90, stadiumName: 'Johan Cruyff Arena' },
  { id: 'nt-germany', name: 'Alemanha', shortName: 'GER', country: 'GER', confederation: 'UEFA', primaryColor: '#ffffff', secondaryColor: '#111111', reputation: 90, stadiumName: 'Allianz Arena' },
  { id: 'nt-belgium', name: 'Bélgica', shortName: 'BEL', country: 'BEL', confederation: 'UEFA', primaryColor: '#e30613', secondaryColor: '#111111', reputation: 87, stadiumName: 'Rei Balduíno' },
  { id: 'nt-italy', name: 'Itália', shortName: 'ITA', country: 'ITA', confederation: 'UEFA', primaryColor: '#0066b2', secondaryColor: '#ffffff', reputation: 87, stadiumName: 'Stadio Olimpico' },
  { id: 'nt-croatia', name: 'Croácia', shortName: 'CRO', country: 'CRO', confederation: 'UEFA', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 86, stadiumName: 'Maksimir' },
  { id: 'nt-uruguay', name: 'Uruguai', shortName: 'URU', country: 'URU', confederation: 'CONMEBOL', primaryColor: '#5aa9e6', secondaryColor: '#111111', reputation: 86, stadiumName: 'Centenario' },
  { id: 'nt-colombia', name: 'Colômbia', shortName: 'COL', country: 'COL', confederation: 'CONMEBOL', primaryColor: '#fcd116', secondaryColor: '#003893', reputation: 85, stadiumName: 'Metropolitano Roberto Meléndez' },
  { id: 'nt-morocco', name: 'Marrocos', shortName: 'MAR', country: 'MAR', confederation: 'CAF', primaryColor: '#c1272d', secondaryColor: '#006233', reputation: 85, stadiumName: 'Grand Stade Hassan II' },
  { id: 'nt-switzerland', name: 'Suíça', shortName: 'SUI', country: 'SUI', confederation: 'UEFA', primaryColor: '#d52b1e', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'Wankdorf' },
  { id: 'nt-denmark', name: 'Dinamarca', shortName: 'DEN', country: 'DEN', confederation: 'UEFA', primaryColor: '#c60c30', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'Parken' },
  { id: 'nt-mexico', name: 'México', shortName: 'MEX', country: 'MEX', confederation: 'CONCACAF', primaryColor: '#006847', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Estadio Azteca' },
  { id: 'nt-usa', name: 'Estados Unidos', shortName: 'USA', country: 'USA', confederation: 'CONCACAF', primaryColor: '#1e3a8a', secondaryColor: '#c8102e', reputation: 82, stadiumName: 'MetLife Stadium' },
  { id: 'nt-japan', name: 'Japão', shortName: 'JPN', country: 'JPN', confederation: 'AFC', primaryColor: '#1d3f8c', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Estádio Nacional de Tóquio' },
  { id: 'nt-senegal', name: 'Senegal', shortName: 'SEN', country: 'SEN', confederation: 'CAF', primaryColor: '#00853f', secondaryColor: '#fdef42', reputation: 81, stadiumName: 'Abdoulaye Wade' },
  { id: 'nt-austria', name: 'Áustria', shortName: 'AUT', country: 'AUT', confederation: 'UEFA', primaryColor: '#ed2939', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'Ernst Happel' },
  { id: 'nt-norway', name: 'Noruega', shortName: 'NOR', country: 'NOR', confederation: 'UEFA', primaryColor: '#ba0c2f', secondaryColor: '#00205b', reputation: 81, stadiumName: 'Ullevaal' },
  { id: 'nt-ecuador', name: 'Equador', shortName: 'ECU', country: 'ECU', confederation: 'CONMEBOL', primaryColor: '#ffd100', secondaryColor: '#034ea2', reputation: 80, stadiumName: 'Rodrigo Paz Delgado' },
  { id: 'nt-south-korea', name: 'Coreia do Sul', shortName: 'KOR', country: 'KOR', confederation: 'AFC', primaryColor: '#cd2e3a', secondaryColor: '#111111', reputation: 79, stadiumName: 'Estádio da Copa de Seul' },
  { id: 'nt-iran', name: 'Irã', shortName: 'IRN', country: 'IRN', confederation: 'AFC', primaryColor: '#ffffff', secondaryColor: '#da0000', reputation: 77, stadiumName: 'Azadi' },
  { id: 'nt-australia', name: 'Austrália', shortName: 'AUS', country: 'AUS', confederation: 'AFC', primaryColor: '#ffcd00', secondaryColor: '#00843d', reputation: 77, stadiumName: 'Stadium Australia' },
  { id: 'nt-nigeria', name: 'Nigéria', shortName: 'NGA', country: 'NGA', confederation: 'CAF', primaryColor: '#008751', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Godswill Akpabio' },
  { id: 'nt-canada', name: 'Canadá', shortName: 'CAN', country: 'CAN', confederation: 'CONCACAF', primaryColor: '#d80621', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'BMO Field' },
  { id: 'nt-egypt', name: 'Egito', shortName: 'EGY', country: 'EGY', confederation: 'CAF', primaryColor: '#c8102e', secondaryColor: '#111111', reputation: 77, stadiumName: 'Estádio Internacional do Cairo' },
  { id: 'nt-paraguay', name: 'Paraguai', shortName: 'PAR', country: 'PAR', confederation: 'CONMEBOL', primaryColor: '#d52b1e', secondaryColor: '#0038a8', reputation: 78, stadiumName: 'Defensores del Chaco' },
  { id: 'nt-ivory-coast', name: 'Costa do Marfim', shortName: 'CIV', country: 'CIV', confederation: 'CAF', primaryColor: '#f77f00', secondaryColor: '#009e60', reputation: 79, stadiumName: 'Alassane Ouattara' },
  { id: 'nt-saudi-arabia', name: 'Arábia Saudita', shortName: 'KSA', country: 'KSA', confederation: 'AFC', primaryColor: '#006c35', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'King Fahd' },
]

const CONFEDERATION_OF = new Map(NATIONS.map((n) => [n.id, n.confederation]))

export function confederationOf(teamId: string): Confederation | undefined {
  return CONFEDERATION_OF.get(teamId)
}

export function isNationalTeam(teamId: string | null | undefined) {
  return !!teamId && CONFEDERATION_OF.has(teamId)
}

/** Data dos convocados (as idades são calculadas nela). */
export const NATIONAL_SQUADS_DATE: string = squads.fetchedAt
const RAW: Record<string, { manager?: string; players: RawPlayer[] }> = squads.clubs

/** Seleções com convocados e técnicos reais (nova cópia a cada chamada). */
export function createNationalTeams(): Team[] {
  const teams = teamsFromLeagueFile({
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    name: WORLD_CUP_NAME,
    teams: NATIONS.map(({ confederation: _c, country: _country, ...t }) => ({
      ...t,
      // A série não vale para seleções (não disputam a liga).
      division: 'A',
      ...(RAW[t.id]?.manager ? { manager: RAW[t.id]!.manager } : {}),
      ...(NATIONAL_CRESTS[t.id] ? { crest: NATIONAL_CRESTS[t.id] } : {}),
      players: realSquadFrom(RAW[t.id]?.players, t.id, t.reputation, NATIONAL_SQUADS_DATE),
    })),
  })
  // O código do país aparece na etiqueta de país (BRA, ARG...).
  const country = new Map(NATIONS.map((n) => [n.id, n.country]))
  return teams.map((t) => ({ ...t, country: country.get(t.id) }))
}

/** Sorteio da Copa: no máximo uma seleção por continente em cada grupo (Europa: até duas). */
const CONFEDERATION_RULE: DrawRule = {
  keyOf: (t) => confederationOf(t.id) ?? t.id,
  maxPerGroup: (key) => (key === 'UEFA' ? 2 : 1),
}

/** Rodadas do campeonato antes de cada etapa da Copa (junho e julho), fora dos intervalos ocupados. */
export function worldCupSchedule(leagueRounds: number, avoid: number[] = []) {
  return stageSchedule(STAGE_TIMING, leagueRounds, avoid)
}

/**
 * Cria a Copa do Mundo da temporada. \`playedLeagueRounds\` empurra o calendário quando ela começa com o
 * campeonato em andamento (saves antigos).
 */
export function createWorldCup(
  nations: Team[],
  season: number,
  leagueRounds: number,
  avoid: number[] = [],
  playedLeagueRounds = 0,
  random: () => number = Math.random,
): LibertadoresState {
  const groups = drawGroups(nations, random, CONFEDERATION_RULE)
  return {
    season,
    groups,
    groupRounds: groupRoundsFor(groups, false),
    knockout: [],
    stage: 0,
    schedule: worldCupSchedule(leagueRounds, avoid).map((r) => Math.max(r, playedLeagueRounds)),
    championId: null,
  }
}

/**
 * Seleções que convidam o técnico (no começo da temporada de Copa), pelo prestígio dele:
 * a reputação do clube que ele treina mais um bônus pelas taças. As mais próximas desse nível chamam;
 * quem tem prestígio alto pode receber convite de uma das grandes.
 */
export function nationalTeamOffers(prestige: number, random: () => number = Math.random, count = 3): string[] {
  const ranked = [...NATIONS]
    .filter((n) => n.reputation <= prestige + 2)
    .sort((a, b) => Math.abs(a.reputation - prestige) - Math.abs(b.reputation - prestige))
  // Entre as 6 de nível mais parecido, sorteia quem chama.
  const pool = (ranked.length ? ranked : [...NATIONS].sort((a, b) => a.reputation - b.reputation)).slice(0, 6)
  const picked: string[] = []
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!.id)
  return picked
}
