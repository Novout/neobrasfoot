import type { Team } from '../../types/game'
import { PREMIER_CRESTS } from '../crests'
import { foreignLeagueTeams, type ForeignClub, type ForeignSquads } from './foreignLeague'
import squads from './premier-squads.json'

/**
 * Premier League (1ª divisão inglesa), temporada 2026–27: 20 clubes, 38 rodadas, em paralelo às séries no 2×20.
 * Elencos, técnicos e estádios reais: premier-squads.json (`npm run update-premier`).
 * Escudos: public/escudos/<id>.png (`npm run update-escudos-premier`).
 */

export const PREMIER_LEAGUE_NAME = 'Premier League'

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
const CLUBS: ForeignClub[] = [
  { id: 'en-man-city', name: 'Manchester City', shortName: 'MCI', primaryColor: '#6cabdd', secondaryColor: '#ffffff', reputation: 92, stadiumName: 'Etihad Stadium' },
  { id: 'en-arsenal', name: 'Arsenal', shortName: 'ARS', primaryColor: '#ef0107', secondaryColor: '#ffffff', reputation: 92, stadiumName: 'Emirates Stadium' },
  { id: 'en-liverpool', name: 'Liverpool', shortName: 'LIV', primaryColor: '#c8102e', secondaryColor: '#00b2a9', reputation: 92, stadiumName: 'Anfield' },
  { id: 'en-chelsea', name: 'Chelsea', shortName: 'CHE', primaryColor: '#034694', secondaryColor: '#ffffff', reputation: 89, stadiumName: 'Stamford Bridge' },
  { id: 'en-man-united', name: 'Manchester United', shortName: 'MUN', primaryColor: '#da291c', secondaryColor: '#fbe122', reputation: 87, stadiumName: 'Old Trafford' },
  { id: 'en-tottenham', name: 'Tottenham Hotspur', shortName: 'TOT', primaryColor: '#132257', secondaryColor: '#ffffff', reputation: 86, stadiumName: 'Tottenham Hotspur Stadium' },
  { id: 'en-newcastle', name: 'Newcastle United', shortName: 'NEW', primaryColor: '#241f20', secondaryColor: '#ffffff', reputation: 86, stadiumName: "St James' Park" },
  { id: 'en-aston-villa', name: 'Aston Villa', shortName: 'AVL', primaryColor: '#670e36', secondaryColor: '#95bfe5', reputation: 85, stadiumName: 'Villa Park' },
  { id: 'en-brighton', name: 'Brighton & Hove Albion', shortName: 'BHA', primaryColor: '#0057b8', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Falmer Stadium' },
  { id: 'en-nottingham-forest', name: 'Nottingham Forest', shortName: 'NFO', primaryColor: '#dd0000', secondaryColor: '#ffffff', reputation: 81, stadiumName: 'City Ground' },
  { id: 'en-crystal-palace', name: 'Crystal Palace', shortName: 'CRY', primaryColor: '#1b458f', secondaryColor: '#c4122e', reputation: 80, stadiumName: 'Selhurst Park' },
  { id: 'en-brentford', name: 'Brentford', shortName: 'BRE', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'Brentford Community Stadium' },
  { id: 'en-bournemouth', name: 'Bournemouth', shortName: 'BOU', primaryColor: '#da291c', secondaryColor: '#111111', reputation: 79, stadiumName: 'Dean Court' },
  { id: 'en-fulham', name: 'Fulham', shortName: 'FUL', primaryColor: '#ffffff', secondaryColor: '#111111', reputation: 79, stadiumName: 'Craven Cottage' },
  { id: 'en-everton', name: 'Everton', shortName: 'EVE', primaryColor: '#003399', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'Hill Dickinson Stadium' },
  { id: 'en-leeds', name: 'Leeds United', shortName: 'LEE', primaryColor: '#ffffff', secondaryColor: '#1d428a', reputation: 77, stadiumName: 'Elland Road' },
  { id: 'en-sunderland', name: 'Sunderland', shortName: 'SUN', primaryColor: '#eb172b', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Stadium of Light' },
  { id: 'en-coventry', name: 'Coventry City', shortName: 'COV', primaryColor: '#59cbe8', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Coventry Building Society Arena' },
  { id: 'en-ipswich', name: 'Ipswich Town', shortName: 'IPS', primaryColor: '#0044a9', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Portman Road' },
  { id: 'en-hull', name: 'Hull City', shortName: 'HUL', primaryColor: '#f5a12d', secondaryColor: '#111111', reputation: 73, stadiumName: 'MKM Stadium' },
]

/** Clubes da Premier League com elenco, técnico e estádio reais. */
export function premierLeagueTeams(): Team[] {
  return foreignLeagueTeams(PREMIER_LEAGUE_NAME, 'ENG', CLUBS, squads as ForeignSquads, PREMIER_CRESTS)
}
