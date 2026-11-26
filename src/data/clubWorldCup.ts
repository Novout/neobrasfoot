import type { ClubWorldCupState, CupRound, CupTie, Team } from '../types/game'
import { roundName } from './cup'
import { foreignLeagueTeams, type ForeignClub, type ForeignSquads } from './templates/foreignLeague'
import squads from './templates/mundial-squads.json'

/**
 * Mundial de Clubes: 4 clubes no fim da temporada (dezembro, depois do campeonato): o campeão da Libertadores,
 * o campeão da Liga dos Campeões e dois convidados de confederações diferentes, sorteados a cada temporada entre
 * clubes reais da CONCACAF, CAF, AFC e OFC. Semifinais e final em jogo único; empate vai para os pênaltis.
 *
 * Os convidados têm elenco, técnico e estádio reais: mundial-squads.json, baixado da Wikipédia/Wikidata por
 * `npm run update-mundial`. Sem escudos: o distintivo usa as cores do clube.
 */

export const CLUB_WORLD_CUP_NAME = 'Mundial de Clubes'

/** Premiação do clube gerenciado. */
export const CLUB_WORLD_CUP_PRIZES = {
  entry: 2_000_000,
  /** Vencer a semifinal. */
  semifinal: 3_000_000,
  title: 10_000_000,
  runnerUp: 4_000_000,
}

/** Confederações dos convidados do Mundial. */
export type GuestConfederation = 'CONCACAF' | 'CAF' | 'AFC' | 'OFC'

export const GUEST_CONFEDERATION_LABELS: Record<GuestConfederation, string> = {
  CONCACAF: 'CONCACAF (América do Norte, Central e Caribe)',
  CAF: 'CAF (África)',
  AFC: 'AFC (Ásia)',
  OFC: 'OFC (Oceania)',
}

type GuestClub = ForeignClub & { country: string; region: GuestConfederation }

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
export const GUEST_CLUBS: GuestClub[] = [
  // AFC
  { id: 'sa-al-hilal', name: 'Al-Hilal', shortName: 'HIL', country: 'KSA', region: 'AFC', primaryColor: '#0055a5', secondaryColor: '#ffffff', reputation: 84, stadiumName: 'Kingdom Arena' },
  { id: 'sa-al-nassr', name: 'Al-Nassr', shortName: 'NAS', country: 'KSA', region: 'AFC', primaryColor: '#fcd116', secondaryColor: '#0033a0', reputation: 83, stadiumName: 'Al-Awwal Park' },
  { id: 'sa-al-ittihad', name: 'Al-Ittihad', shortName: 'ITT', country: 'KSA', region: 'AFC', primaryColor: '#f6c700', secondaryColor: '#111111', reputation: 82, stadiumName: 'King Abdullah Sports City' },
  { id: 'sa-al-ahli', name: 'Al-Ahli', shortName: 'AHL', country: 'KSA', region: 'AFC', primaryColor: '#00843d', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'King Abdullah Sports City' },
  { id: 'as-urawa', name: 'Urawa Red Diamonds', shortName: 'URA', country: 'JPN', region: 'AFC', primaryColor: '#e6002d', secondaryColor: '#111111', reputation: 77, stadiumName: 'Saitama Stadium 2002' },
  { id: 'as-ulsan', name: 'Ulsan HD', shortName: 'ULS', country: 'KOR', region: 'AFC', primaryColor: '#004a9f', secondaryColor: '#fcd116', reputation: 76, stadiumName: 'Ulsan Munsu' },
  // CAF
  { id: 'af-al-ahly', name: 'Al Ahly', shortName: 'AHY', country: 'EGY', region: 'CAF', primaryColor: '#c8102e', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'Cairo International Stadium' },
  { id: 'af-sundowns', name: 'Mamelodi Sundowns', shortName: 'SUN', country: 'RSA', region: 'CAF', primaryColor: '#fcd116', secondaryColor: '#007a33', reputation: 77, stadiumName: 'Loftus Versfeld' },
  { id: 'af-esperance', name: 'Espérance de Tunis', shortName: 'EST', country: 'TUN', region: 'CAF', primaryColor: '#c8102e', secondaryColor: '#fcd116', reputation: 76, stadiumName: 'Hammadi Agrebi' },
  { id: 'af-wydad', name: 'Wydad', shortName: 'WAC', country: 'MAR', region: 'CAF', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Stade Mohammed V' },
  // CONCACAF
  { id: 'cc-monterrey', name: 'Monterrey', shortName: 'MTY', country: 'MEX', region: 'CONCACAF', primaryColor: '#0a2240', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'Estadio BBVA' },
  { id: 'cc-america', name: 'América', shortName: 'AME', country: 'MEX', region: 'CONCACAF', primaryColor: '#ffd100', secondaryColor: '#1a2b57', reputation: 79, stadiumName: 'Estadio Azteca' },
  { id: 'cc-cruz-azul', name: 'Cruz Azul', shortName: 'CAZ', country: 'MEX', region: 'CONCACAF', primaryColor: '#0047ab', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Estadio Azteca' },
  { id: 'cc-lafc', name: 'Los Angeles FC', shortName: 'LAFC', country: 'USA', region: 'CONCACAF', primaryColor: '#111111', secondaryColor: '#c39e6d', reputation: 77, stadiumName: 'BMO Stadium' },
  { id: 'cc-seattle', name: 'Seattle Sounders', shortName: 'SEA', country: 'USA', region: 'CONCACAF', primaryColor: '#5d9741', secondaryColor: '#005595', reputation: 76, stadiumName: 'Lumen Field' },
  // OFC
  { id: 'oc-auckland-city', name: 'Auckland City', shortName: 'AKL', country: 'NZL', region: 'OFC', primaryColor: '#0055a4', secondaryColor: '#ffffff', reputation: 58, stadiumName: 'Kiwitea Street' },
  { id: 'oc-wellington-olympic', name: 'Wellington Olympic', shortName: 'WOL', country: 'NZL', region: 'OFC', primaryColor: '#0b3d91', secondaryColor: '#ffffff', reputation: 55, stadiumName: 'Wakefield Park' },
  { id: 'oc-hienghene', name: 'Hienghène Sport', shortName: 'HIE', country: 'NCL', region: 'OFC', primaryColor: '#00843d', secondaryColor: '#ffffff', reputation: 54, stadiumName: 'Stade de Hienghène' },
]

/** Convidados do Mundial (CONCACAF, CAF, AFC e OFC), com elenco, técnico e estádio reais (nova cópia a cada chamada). */
export function createGuestTeams(): Team[] {
  const country = new Map(GUEST_CLUBS.map((c) => [c.id, c.country]))
  const clubs: ForeignClub[] = GUEST_CLUBS.map(({ country: _c, region: _r, ...club }) => club)
  return foreignLeagueTeams(CLUB_WORLD_CUP_NAME, 'A', clubs, squads as ForeignSquads).map((t) => ({ ...t, country: country.get(t.id) }))
}

/** Confederação de um convidado. */
export function guestConfederation(teamId: string): GuestConfederation | undefined {
  return GUEST_CLUBS.find((c) => c.id === teamId)?.region
}

/** Convidados da temporada: duas confederações diferentes sorteadas e um clube de cada. */
export function pickGuests(random: () => number = Math.random): string[] {
  const confeds: GuestConfederation[] = ['CONCACAF', 'CAF', 'AFC', 'OFC']
  const first = confeds.splice(Math.floor(random() * confeds.length), 1)[0]!
  const second = confeds[Math.floor(random() * confeds.length)]!
  const pick = (region: GuestConfederation) => {
    const pool = GUEST_CLUBS.filter((c) => c.region === region)
    return pool[Math.floor(random() * pool.length)]!.id
  }
  return [pick(first), pick(second)]
}

/**
 * Cria o Mundial da temporada: as duas etapas (semifinais e final) ficam depois da última rodada do campeonato.
 * As semifinais só são sorteadas quando os campeões da Libertadores e da Liga dos Campeões são conhecidos.
 */
export function createClubWorldCup(season: number, guests: string[], leagueRounds: number): ClubWorldCupState {
  return { season, guests, rounds: [], currentRound: 0, schedule: [leagueRounds, leagueRounds], championId: null }
}

function tie(homeId: string, awayId: string): CupTie {
  return { homeId, awayId, homeGoals: null, awayGoals: null, penalties: null, winnerId: null }
}

/** Semifinais: cada campeão continental enfrenta um dos convidados (sorteado), com mando do campeão. */
export function drawSemifinals(state: ClubWorldCupState, libertadoresChampion: string, championsChampion: string, random: () => number = Math.random): CupRound {
  const [a, b] = random() < 0.5 ? state.guests : [...state.guests].reverse()
  return { name: roundName(2), ties: [tie(libertadoresChampion, a!), tie(championsChampion, b!)] }
}

/** Final entre os vencedores das semifinais (mando sorteado). */
export function drawFinal(semis: CupRound, random: () => number = Math.random): CupRound {
  const [x, y] = semis.ties.map((t) => t.winnerId!)
  const [home, away] = random() < 0.5 ? [x!, y!] : [y!, x!]
  return { name: roundName(1), ties: [tie(home, away)] }
}

/** Clubes no Mundial (os convidados e, depois do sorteio, os campeões continentais). */
export function clubWorldCupTeams(state: ClubWorldCupState) {
  const drawn = state.rounds[0]?.ties.flatMap((t) => [t.homeId, t.awayId]) ?? []
  return drawn.length ? drawn : state.guests
}
