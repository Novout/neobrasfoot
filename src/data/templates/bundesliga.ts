import type { Team } from '../../types/game'
import { BUNDESLIGA_CRESTS } from '../crests'
import { foreignLeagueTeams, type ForeignClub, type ForeignSquads } from './foreignLeague'
import squads from './bundesliga-squads.json'

/**
 * Bundesliga (1ª divisão alemã), temporada 2026–27: 18 clubes e 34 rodadas, como a real. Disputada em paralelo
 * às séries no 2×20 (38 rodadas): as 4 rodadas a mais são folgas espalhadas pela temporada.
 * Elencos, técnicos e estádios reais: bundesliga-squads.json (`npm run update-bundesliga`).
 * Escudos: public/escudos/<id>.png (`npm run update-escudos-bundesliga`).
 */

export const BUNDESLIGA_NAME = 'Bundesliga'

/** Reputação na mesma escala da liga (os grandes do Brasileirão ficam perto de 90). */
const CLUBS: ForeignClub[] = [
  { id: 'de-bayern', name: 'Bayern de Munique', shortName: 'FCB', primaryColor: '#dc052d', secondaryColor: '#ffffff', reputation: 92, stadiumName: 'Allianz Arena' },
  { id: 'de-leverkusen', name: 'Bayer Leverkusen', shortName: 'B04', primaryColor: '#e32221', secondaryColor: '#111111', reputation: 87, stadiumName: 'BayArena' },
  { id: 'de-dortmund', name: 'Borussia Dortmund', shortName: 'BVB', primaryColor: '#fde100', secondaryColor: '#111111', reputation: 87, stadiumName: 'Signal Iduna Park' },
  { id: 'de-leipzig', name: 'RB Leipzig', shortName: 'RBL', primaryColor: '#dd0741', secondaryColor: '#ffffff', reputation: 85, stadiumName: 'Red Bull Arena' },
  { id: 'de-stuttgart', name: 'Stuttgart', shortName: 'VFB', primaryColor: '#e32219', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'MHPArena' },
  { id: 'de-frankfurt', name: 'Eintracht Frankfurt', shortName: 'SGE', primaryColor: '#e1000f', secondaryColor: '#111111', reputation: 82, stadiumName: 'Deutsche Bank Park' },
  { id: 'de-freiburg', name: 'Freiburg', shortName: 'SCF', primaryColor: '#e2001a', secondaryColor: '#111111', reputation: 79, stadiumName: 'Europa-Park Stadion' },
  { id: 'de-hoffenheim', name: 'Hoffenheim', shortName: 'TSG', primaryColor: '#1961b5', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'PreZero Arena' },
  { id: 'de-gladbach', name: "Borussia M'gladbach", shortName: 'BMG', primaryColor: '#111111', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Borussia-Park' },
  { id: 'de-werder', name: 'Werder Bremen', shortName: 'SVW', primaryColor: '#1d9053', secondaryColor: '#ffffff', reputation: 78, stadiumName: 'Weserstadion' },
  { id: 'de-mainz', name: 'Mainz 05', shortName: 'M05', primaryColor: '#c3141e', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Mewa Arena' },
  { id: 'de-union-berlin', name: 'Union Berlin', shortName: 'FCU', primaryColor: '#eb1923', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Stadion An der Alten Försterei' },
  { id: 'de-augsburg', name: 'Augsburg', shortName: 'FCA', primaryColor: '#ba3733', secondaryColor: '#46714d', reputation: 76, stadiumName: 'WWK Arena' },
  { id: 'de-koln', name: 'Colônia', shortName: 'KOE', primaryColor: '#ed1c24', secondaryColor: '#ffffff', reputation: 76, stadiumName: 'RheinEnergieStadion' },
  { id: 'de-hamburg', name: 'Hamburgo', shortName: 'HSV', primaryColor: '#0a3f86', secondaryColor: '#ffffff', reputation: 76, stadiumName: 'Volksparkstadion' },
  { id: 'de-schalke', name: 'Schalke 04', shortName: 'S04', primaryColor: '#004d9d', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Veltins-Arena' },
  { id: 'de-paderborn', name: 'Paderborn', shortName: 'SCP', primaryColor: '#005ca9', secondaryColor: '#111111', reputation: 72, stadiumName: 'Home Deluxe Arena' },
  { id: 'de-elversberg', name: 'Elversberg', shortName: 'SVE', primaryColor: '#111111', secondaryColor: '#ffffff', reputation: 71, stadiumName: 'Waldstadion an der Kaiserlinde' },
]

/** Clubes da Bundesliga com elenco, técnico e estádio reais. */
export function bundesligaTeams(): Team[] {
  return foreignLeagueTeams(BUNDESLIGA_NAME, 'GER', CLUBS, squads as ForeignSquads, BUNDESLIGA_CRESTS)
}
