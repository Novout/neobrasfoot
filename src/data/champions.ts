import type { LibertadoresState, Team } from '../types/game'
import { drawGroups, groupRoundsFor, stageSchedule } from './libertadores'
import { foreignLeagueTeams, type ForeignClub, type ForeignSquads } from './templates/foreignLeague'
import squads from './templates/champions-squads.json'

/**
 * Liga dos Campeões: os 4 primeiros da La Liga, da Premier League e da Bundesliga (na temporada anterior; na 1ª,
 * os de maior reputação) e 20 clubes reais de outras ligas da Europa. Fase de grupos (8 grupos de 4, turno e
 * returno; passam os 2 primeiros) e mata-mata em jogo único até a final. Usa o mesmo motor da Libertadores.
 *
 * Os clubes de fora das ligas do jogo têm elenco, técnico e estádio reais: champions-squads.json, baixado da
 * Wikipédia/Wikidata por `npm run update-champions`. Sem escudos: o distintivo usa as cores do clube.
 */

export const CHAMPIONS_NAME = 'Liga dos Campeões'
/** Vagas de cada liga estrangeira do jogo (La Liga, Premier League, Bundesliga). */
export const CHAMPIONS_SPOTS_PER_LEAGUE = 4

/** Premiação do clube gerenciado (maior que a da Libertadores). */
export const CHAMPIONS_PRIZES = {
  entry: 2_000_000,
  groupWin: 500_000,
  groupDraw: 150_000,
  knockout: [2_500_000, 3_500_000, 5_000_000, 12_000_000],
  runnerUp: 6_000_000,
}

/** Momento de cada etapa na temporada (fração do campeonato): grupos no começo, final perto do fim. */
const STAGE_TIMING = [0.1, 0.16, 0.22, 0.27, 0.32, 0.37, 0.6, 0.7, 0.8, 0.92]

type EuropeanClub = ForeignClub & { country: string }

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
export const EUROPEAN_CLUBS: EuropeanClub[] = [
  { id: 'fr-psg', name: 'Paris Saint-Germain', shortName: 'PSG', country: 'FRA', primaryColor: '#004170', secondaryColor: '#da291c', reputation: 92, stadiumName: 'Parc des Princes' },
  { id: 'it-inter', name: 'Inter de Milão', shortName: 'INT', country: 'ITA', primaryColor: '#0068a8', secondaryColor: '#111111', reputation: 90, stadiumName: 'San Siro' },
  { id: 'it-juventus', name: 'Juventus', shortName: 'JUV', country: 'ITA', primaryColor: '#111111', secondaryColor: '#ffffff', reputation: 87, stadiumName: 'Allianz Stadium' },
  { id: 'it-napoli', name: 'Napoli', shortName: 'NAP', country: 'ITA', primaryColor: '#12a0d7', secondaryColor: '#ffffff', reputation: 87, stadiumName: 'Diego Armando Maradona' },
  { id: 'it-milan', name: 'Milan', shortName: 'MIL', country: 'ITA', primaryColor: '#fb090b', secondaryColor: '#111111', reputation: 86, stadiumName: 'San Siro' },
  { id: 'it-atalanta', name: 'Atalanta', shortName: 'ATA', country: 'ITA', primaryColor: '#1e71b8', secondaryColor: '#111111', reputation: 84, stadiumName: 'Gewiss Stadium' },
  { id: 'it-roma', name: 'Roma', shortName: 'ROM', country: 'ITA', primaryColor: '#8e1f2f', secondaryColor: '#f0bc42', reputation: 83, stadiumName: 'Stadio Olimpico' },
  { id: 'pt-benfica', name: 'Benfica', shortName: 'BEN', country: 'POR', primaryColor: '#e20e0e', secondaryColor: '#ffffff', reputation: 84, stadiumName: 'Estádio da Luz' },
  { id: 'pt-sporting', name: 'Sporting', shortName: 'SCP', country: 'POR', primaryColor: '#008057', secondaryColor: '#ffffff', reputation: 84, stadiumName: 'Estádio José Alvalade' },
  { id: 'pt-porto', name: 'Porto', shortName: 'FCP', country: 'POR', primaryColor: '#00428c', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'Estádio do Dragão' },
  { id: 'fr-monaco', name: 'Monaco', shortName: 'MON', country: 'FRA', primaryColor: '#e7192b', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Stade Louis II' },
  { id: 'fr-marseille', name: 'Olympique de Marseille', shortName: 'OM', country: 'FRA', primaryColor: '#2faee0', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Stade Vélodrome' },
  { id: 'nl-psv', name: 'PSV', shortName: 'PSV', country: 'NED', primaryColor: '#ed1c24', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Philips Stadion' },
  { id: 'tr-galatasaray', name: 'Galatasaray', shortName: 'GAL', country: 'TUR', primaryColor: '#a90432', secondaryColor: '#fdb912', reputation: 81, stadiumName: 'RAMS Park' },
  { id: 'fr-lille', name: 'Lille', shortName: 'LIL', country: 'FRA', primaryColor: '#e01e13', secondaryColor: '#24216a', reputation: 80, stadiumName: 'Stade Pierre-Mauroy' },
  { id: 'nl-ajax', name: 'Ajax', shortName: 'AJA', country: 'NED', primaryColor: '#d2122e', secondaryColor: '#ffffff', reputation: 80, stadiumName: 'Johan Cruyff Arena' },
  { id: 'nl-feyenoord', name: 'Feyenoord', shortName: 'FEY', country: 'NED', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 80, stadiumName: 'De Kuip' },
  { id: 'be-brugge', name: 'Club Brugge', shortName: 'CLU', country: 'BEL', primaryColor: '#0067ce', secondaryColor: '#111111', reputation: 79, stadiumName: 'Jan Breydel' },
  { id: 'sc-celtic', name: 'Celtic', shortName: 'CEL', country: 'SCO', primaryColor: '#018749', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Celtic Park' },
  { id: 'at-salzburg', name: 'Red Bull Salzburg', shortName: 'RBS', country: 'AUT', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Red Bull Arena' },
]

/** Clubes europeus de fora das ligas do jogo, com elenco, técnico e estádio reais (nova cópia a cada chamada). */
export function createEuropeanTeams(): Team[] {
  const country = new Map(EUROPEAN_CLUBS.map((c) => [c.id, c.country]))
  const clubs: ForeignClub[] = EUROPEAN_CLUBS.map(({ country: _c, ...club }) => club)
  // A série não vale para eles (não disputam a liga); o país vai na etiqueta e no sorteio.
  return foreignLeagueTeams(CHAMPIONS_NAME, 'A', clubs, squads as ForeignSquads).map((t) => ({ ...t, country: country.get(t.id) }))
}

/** Rodadas do campeonato antes de cada etapa, fora dos intervalos ocupados (Copa do Brasil e Libertadores). */
export function championsSchedule(leagueRounds: number, avoid: number[] = []) {
  return stageSchedule(STAGE_TIMING, leagueRounds, avoid)
}

/**
 * Cria a Liga dos Campeões da temporada (sorteio sem dois clubes do mesmo país no mesmo grupo).
 * `playedLeagueRounds` empurra o calendário quando ela começa com o campeonato em andamento (saves antigos).
 */
export function createChampions(
  participants: Team[],
  season: number,
  leagueRounds: number,
  avoid: number[] = [],
  playedLeagueRounds = 0,
  random: () => number = Math.random,
): LibertadoresState {
  const groups = drawGroups(participants, random)
  return {
    season,
    groups,
    groupRounds: groupRoundsFor(groups),
    knockout: [],
    stage: 0,
    schedule: championsSchedule(leagueRounds, avoid).map((r) => Math.max(r, playedLeagueRounds)),
    championId: null,
  }
}
