import type { ClubWorldCupState, CupRound, CupTie, Team } from '../types/game'
import { roundName } from './cup'
import { foreignLeagueTeams, type ForeignClub, type ForeignSquads } from './templates/foreignLeague'
import squads from './templates/mundial-squads.json'

/**
 * Mundial de Clubes: 4 clubes no fim da temporada (dezembro, depois do campeonato): o campeão da Libertadores,
 * o campeão da Liga dos Campeões, um clube da Arábia Saudita e um da África (sorteados a cada temporada entre
 * clubes reais). Semifinais e final em jogo único; empate vai para os pênaltis.
 *
 * Os clubes árabes e africanos têm elenco, técnico e estádio reais: mundial-squads.json, baixado da
 * Wikipédia/Wikidata por `npm run update-mundial`. Sem escudos: o distintivo usa as cores do clube.
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

type GuestClub = ForeignClub & { country: string; region: 'asia' | 'africa' }

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
export const GUEST_CLUBS: GuestClub[] = [
  { id: 'sa-al-hilal', name: 'Al-Hilal', shortName: 'HIL', country: 'KSA', region: 'asia', primaryColor: '#0055a5', secondaryColor: '#ffffff', reputation: 84, stadiumName: 'Kingdom Arena' },
  { id: 'sa-al-nassr', name: 'Al-Nassr', shortName: 'NAS', country: 'KSA', region: 'asia', primaryColor: '#fcd116', secondaryColor: '#0033a0', reputation: 83, stadiumName: 'Al-Awwal Park' },
  { id: 'sa-al-ittihad', name: 'Al-Ittihad', shortName: 'ITT', country: 'KSA', region: 'asia', primaryColor: '#f6c700', secondaryColor: '#111111', reputation: 82, stadiumName: 'King Abdullah Sports City' },
  { id: 'sa-al-ahli', name: 'Al-Ahli', shortName: 'AHL', country: 'KSA', region: 'asia', primaryColor: '#00843d', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'King Abdullah Sports City' },
  { id: 'af-al-ahly', name: 'Al Ahly', shortName: 'AHY', country: 'EGY', region: 'africa', primaryColor: '#c8102e', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'Cairo International Stadium' },
  { id: 'af-sundowns', name: 'Mamelodi Sundowns', shortName: 'SUN', country: 'RSA', region: 'africa', primaryColor: '#fcd116', secondaryColor: '#007a33', reputation: 77, stadiumName: 'Loftus Versfeld' },
  { id: 'af-esperance', name: 'Espérance de Tunis', shortName: 'EST', country: 'TUN', region: 'africa', primaryColor: '#c8102e', secondaryColor: '#fcd116', reputation: 76, stadiumName: 'Hammadi Agrebi' },
  { id: 'af-wydad', name: 'Wydad', shortName: 'WAC', country: 'MAR', region: 'africa', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Stade Mohammed V' },
]

/** Clubes árabes e africanos do Mundial, com elenco, técnico e estádio reais (nova cópia a cada chamada). */
export function createGuestTeams(): Team[] {
  const country = new Map(GUEST_CLUBS.map((c) => [c.id, c.country]))
  const clubs: ForeignClub[] = GUEST_CLUBS.map(({ country: _c, region: _r, ...club }) => club)
  return foreignLeagueTeams(CLUB_WORLD_CUP_NAME, 'A', clubs, squads as ForeignSquads).map((t) => ({ ...t, country: country.get(t.id) }))
}

/** Convidados da temporada: um clube árabe e um africano, sorteados. */
export function pickGuests(random: () => number = Math.random): string[] {
  const pick = (region: GuestClub['region']) => {
    const pool = GUEST_CLUBS.filter((c) => c.region === region)
    return pool[Math.floor(random() * pool.length)]!.id
  }
  return [pick('asia'), pick('africa')]
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
